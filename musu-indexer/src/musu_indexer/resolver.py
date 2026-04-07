import os
import re
import sys
from pathlib import Path
from typing import List, Optional

# Constants based on OpenClaw's logic
DEFAULT_PATHEXT = ".EXE;.CMD;.BAT;.COM"

class ProcessResolver:
    """
    Intelligent Process Resolver inspired by OpenClaw's windows-spawn.ts.
    Bypasses shell wrappers and shims to target native binaries directly.
    """

    @staticmethod
    def resolve_executable_path(command: str) -> str:
        """Resolves a command name through PATH and PATHEXT."""
        if os.path.isabs(command) or os.path.sep in command or '/' in command:
            return command

        path_env = os.environ.get("PATH", "")
        path_ext = os.environ.get("PATHEXT", DEFAULT_PATHEXT).split(";")
        
        # Ensure extensions are lowercase and have dot
        path_ext = [ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in path_ext]
        
        # On Linux, PATHEXT is empty, so we add an empty string to check for exact name
        if not sys.platform == "win32":
            path_ext = [""]

        for entry in path_env.split(os.pathsep):
            entry = entry.strip()
            if not entry: continue
            
            for ext in path_ext:
                candidate = Path(entry) / f"{command}{ext}"
                if candidate.is_file():
                    return str(candidate)
        
        return command

    @staticmethod
    def unwrap_windows_shim(wrapper_path: str) -> Optional[str]:
        """
        Reads a .cmd or .bat shim (like those from npm/npx) 
        and attempts to extract the real entrypoint binary.
        """
        if not wrapper_path.lower().endswith(('.cmd', '.bat')):
            return None

        try:
            with open(wrapper_path, "r", encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # OpenClaw's regex trick: find quoted paths that aren't the shim itself
            # Example: "%~dp0\node.exe"  "%~dp0\node_modules\..."
            matches = re.findall(r'"([^"\r\n]*)"', content)
            
            for match in matches:
                # Resolve relative to shim directory
                resolved = (Path(wrapper_path).parent / match.replace('%~dp0', '.')).resolve()
                if resolved.is_file() and resolved.suffix.lower() == '.exe' and 'node.exe' not in resolved.name.lower():
                    return str(resolved)
                
                # If it's a node script, we might want the node.exe + script path
                # For now, we prioritize direct binaries.
        except Exception:
            pass
        
        return None

    @classmethod
    def materialize_command(cls, command: str, args: List[str]) -> List[str]:
        """
        Final command list preparation. 
        Unwraps shims and normalizes paths for the target OS.
        """
        resolved_path = cls.resolve_executable_path(command)
        
        # Only try to unwrap on Windows
        if sys.platform == "win32":
            unwrapped = cls.unwrap_windows_shim(resolved_path)
            if unwrapped:
                print(f"🕵️‍♂️ [Claw] Unwrapped shim: {command} -> {unwrapped}")
                return [unwrapped] + args

        return [resolved_path] + args

# Global helper for easy access
def resolve_and_materialize(command: str, *args) -> List[str]:
    return ProcessResolver.materialize_command(command, list(args))
