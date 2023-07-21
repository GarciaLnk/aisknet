# export.py

This Python script is used to export and quantize models from HuggingFace to ONNX.

## Environment Setup

Setup conda, [mamba](https://github.com/conda-forge/miniforge#install) or any other virtual environment manager.

```bash
curl -L -O "https://github.com/conda-forge/miniforge/releases/latest/download/Mambaforge-$(uname)-$(uname -m).sh"
bash Mambaforge-$(uname)-$(uname -m).sh
```

Create a new virtual environment with the Pytorch and HuggingFace dependencies and activate it.

```bash
mamba create -n aisknet python=3.10 pytorch pytorch-cuda=11.8 transformers accelerate -c pytorch -c nvidia -c huggingface
mamba activate aisknet
```

Install dependencies not available in conda.

```bash
pip install onnxruntime onnxruntime-gpu bitsandbytes git+https://github.com/huggingface/optimum.git#egg=optimum[onnxruntime,exporters]
```

## Usage

To use the script indicate the HuggingFace model name as an argument.

```bash
python export.py <hf_model_name>
```

For example, to export the [flan-t5-base](https://huggingface.co/google/flan-t5-base) model:

```bash
python export.py google/flan-t5-base
```
