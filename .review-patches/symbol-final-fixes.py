import subprocess

# Retain the exact checked refinement, then add literal block annotations.
# Neither script changes lockfiles, payment code or the original engineering values.
subprocess.run(['python3', '.review-patches/symbol-final-core.py'], check=True)
subprocess.run(['python3', '.review-patches/symbol-annotation-fixes.py'], check=True)
