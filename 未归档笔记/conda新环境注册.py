# ---
# jupyter:
#   jupytext:
#     formats: ipynb,md:myst
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.19.1
#   kernelspec:
#     display_name: Python (ngs)
#     language: python
#     name: ngs
# ---

# %% editable=true slideshow={"slide_type": ""}
import sys
print(sys.executable)

# %%
conda create -n yolo python=3.11 ipykernel -c conda-forge --override-channels -y
conda activate ngs
conda config --set solver libmamba
conda install -y ipykernel
python -m ipykernel install --user --name ngs --display-name "Python (ngs)"


# %%
import pkg_resources
for pkg in sorted(pkg_resources.working_set, key=lambda x: x.project_name.lower()):
    print(f"{pkg.project_name}=={pkg.version}")

# %%
# !pip list

# %%
import jupytext
print(jupytext.__version__)

# %%
import jupytext
jupytext.write(jupytext.read('notebook.ipynb'), 'notebook.py')

# %%
import ipynbname
print(ipynbname.name())

# %%
import ipynbname
print(ipynbname.name())

# %%
print("finished OK")

# %%
import jupytext
import ipynbname

name = ipynbname.name()  # 获取当前 notebook 名字（不含扩展名）

jupytext.write(jupytext.read(f'{name}.ipynb'), f'{name}.py')

# %%
