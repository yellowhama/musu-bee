import os
log_file = "logs/bridge-20260506.log"
with open(log_file, "r") as f:
    lines = f.readlines()
    for line in lines[-50:]:
        print(line, end="")