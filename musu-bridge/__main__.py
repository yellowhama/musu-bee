"""Allow `python -m musu_bridge` to invoke the CLI."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from cli import main  # noqa: E402

if __name__ == "__main__":
    main()
