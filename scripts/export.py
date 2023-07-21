#!/usr/bin/env python3

"""
export.py:
This script exports a pre-trained model from PyTorch to ONNX format.
It also applies quantization to the ONNX model to make it smaller and faster.
This is specifically designed to work with models from HuggingFace.
"""

import argparse
import subprocess
from pathlib import Path
import torch
from optimum.utils import DEFAULT_DUMMY_SHAPES
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from optimum.exporters.tasks import TasksManager
from optimum.exporters.onnx.utils import (
  get_encoder_decoder_models_for_export,
  get_decoder_models_for_export
)
from optimum.exporters.onnx.convert import export_models, export
from optimum.onnx.graph_transformations import merge_decoders
from optimum.onnxruntime.utils import (
  ONNX_WEIGHTS_NAME,
  ONNX_ENCODER_NAME,
  ONNX_DECODER_NAME,
  ONNX_DECODER_WITH_PAST_NAME,
  ONNX_DECODER_MERGED_NAME,
  ORTQuantizableOperator
)


def parse_args():
  """
  Function to parse the command-line arguments.
  It currently supports only a single argument 'model_name' which is mandatory.
  Returns the parsed arguments.
  """
  parser = argparse.ArgumentParser()
  parser.add_argument('model_name', help='Name of the model to be used')
  return parser.parse_args()


def setup_output_folder(args):
  """
  Function to setup the output folder based on the provided arguments.
  It creates the directory if it doesn't already exist.
  Returns a dictionary with file names associated with their respective Path.
  """
  output_folder = Path(f'../models/{args.model_name.split("/")[-1]}')
  output_folder.mkdir(parents=True, exist_ok=True)

  return {
    'weights': output_folder / ONNX_WEIGHTS_NAME,
    'encoder': output_folder / ONNX_ENCODER_NAME,
    'decoder': output_folder / ONNX_DECODER_NAME,
    'decoder_with_past': output_folder / ONNX_DECODER_WITH_PAST_NAME,
    'decoder_merged': output_folder / ONNX_DECODER_MERGED_NAME,
  }


def initialize_model(args, device):
  """
  Function to initialize the model based on the provided arguments and device.
  It infers the task from the model and gets the model from the task.
  It also prepares the configuration for the ONNX exporter.
  Returns the task, the model, and the ONNX configuration.
  """
  task = TasksManager.infer_task_from_model(args.model_name)

  model = TasksManager.get_model_from_task(
    task, args.model_name, framework='pt', device=device)
  onnx_config_constructor = TasksManager.get_exporter_config_constructor(
    model=model,
    exporter='onnx',
    task=task
  )
  onnx_config = onnx_config_constructor(model.config)

  return task, model, onnx_config


def cleanup_files(output_folder, output_paths):
  """
  Function to clean up unnecessary files.
  It deletes the config.json and ort_config.json files.
  If the decoder_with_past file exist, it gets merged into one file.
  """
  (output_folder / 'config.json').unlink(missing_ok=True)
  (output_folder / 'ort_config.json').unlink(missing_ok=True)

  if output_paths['decoder'].exists(
  ) and output_paths['decoder_with_past'].exists():
    merge_decoders(
      str(output_paths['decoder']),
      str(output_paths['decoder_with_past']),
      save_path=str(output_paths['decoder_merged']),
    )
    output_paths['decoder'].unlink(missing_ok=True)
    output_paths['decoder_with_past'].unlink(missing_ok=True)
    output_paths['decoder_merged'].rename(output_paths['decoder'])


def compress_files(output_folder):
  """
  Function to compress ONNX files to save disk space.
  It requires the 'pigz' utility to be installed on the system.
  """
  for file in output_folder.glob('*.onnx'):
    out_path = file.with_suffix('.onnx.gz')
    with out_path.open('wb') as f_out:
      with subprocess.Popen(
          ['pigz', '--best', '-c', str(file)],
          stdout=f_out
      ) as pigz:
        pigz.wait()
    file.unlink()


def main():
  """
  Main function of the script.
  It performs the following steps:
  1. Parse command-line arguments.
  2. Setup the output folder.
  3. Initialize the model.
  4. Export the model to ONNX format.
  5. Apply quantization to the ONNX model.
  6. Cleanup unnecessary files.
  7. Compress ONNX files to reduce download time.
  """
  args = parse_args()
  if not args.model_name:
    raise ValueError('Please provide the name of the model to be used.')

  device = 'cpu'
  if torch.cuda.is_available():
    device = 'cuda'

  output_folder = Path(f'../models/{args.model_name.split("/")[-1]}')
  output_paths = setup_output_folder(args)

  task, model, onnx_config = initialize_model(args, device)
  model.config.save_pretrained(str(output_folder))

  if model.config.is_encoder_decoder or task.startswith('causal-lm'):
    if model.config.is_encoder_decoder:
      models_and_onnx_configs = get_encoder_decoder_models_for_export(
        model, onnx_config)
    else:
      get_decoder_models_for_export(model, onnx_config)

    export_models(
      models_and_onnx_configs=models_and_onnx_configs,
      opset=onnx_config.DEFAULT_ONNX_OPSET,
      output_dir=str(output_folder),
      input_shapes=DEFAULT_DUMMY_SHAPES.copy(),
      device=device,
    )
    enc_dec = True
  else:
    export(
      model=model,
      config=onnx_config,
      output=output_paths['weights'],
      opset=onnx_config.DEFAULT_ONNX_OPSET,
      input_shapes=DEFAULT_DUMMY_SHAPES.copy(),
      device=device,
    )
    enc_dec = False

  quantizer = [
    ORTQuantizer.from_pretrained(str(output_folder), file_name=f'{x}.onnx')
    for x in models_and_onnx_configs
  ] if enc_dec else ORTQuantizer.from_pretrained(
      str(output_folder),
      file_name=ONNX_WEIGHTS_NAME
    )

  qconfig = AutoQuantizationConfig.avx2(
    is_static=False,
    per_channel=True,
    reduce_range=True,
    operators_to_quantize=[o.value for o in ORTQuantizableOperator]
  )

  for quant in (quantizer if isinstance(quantizer, list) else [quantizer]):
    quant.quantize(
      save_dir=str(output_folder),
      quantization_config=qconfig)

  cleanup_files(output_folder, output_paths)
  compress_files(output_folder)


if __name__ == '__main__':
  main()
