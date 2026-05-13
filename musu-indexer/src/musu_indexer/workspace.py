from __future__ import annotations

import json
import os
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path, PurePosixPath

PROFILE_FILE_NAME = ".musu-indexer.json"

DEFAULT_IGNORE_GLOBS = (
    ".git/**",
    "node_modules/**",
    "target/**",
    "dist/**",
    "build/**",
    "work/**",
    "__pycache__/**",
    ".venv/**",
    ".musu_dev.db",
    ".musu_dev.db-*",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.zip",
    "*.7z",
)

CODE_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".css",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".kt",
    ".mjs",
    ".php",
    ".ps1",
    ".py",
    ".rb",
    ".rs",
    ".scss",
    ".sh",
    ".sql",
    ".swift",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
    ".zsh",
}

DOC_EXTENSIONS = {
    ".adoc",
    ".md",
    ".mdx",
    ".rst",
    ".txt",
}

DOC_FILENAMES = {
    "agents.md",
    "changelog.md",
    "claude.md",
    "contributing.md",
    "readme.md",
    "todo.md",
}


def _as_path(value: str | os.PathLike[str] | None) -> Path | None:
    if value is None:
        return None
    return Path(value).expanduser().resolve()


def _find_in_parents(start: Path, marker: str) -> Path | None:
    current = start if start.is_dir() else start.parent
    for candidate in (current, *current.parents):
        if (candidate / marker).exists():
            return candidate / marker
    return None


def _normalize_rel_root(raw_path: str) -> str:
    normalized = raw_path.replace("\\", "/").strip("/")
    if normalized in {"", "."}:
        return "."
    return normalized


def _resolve_profile_root(base_dir: Path, raw_root: str | None) -> Path:
    if not raw_root:
        return base_dir.resolve()
    root_path = Path(raw_root)
    if root_path.is_absolute():
        return root_path.resolve()
    return (base_dir / root_path).resolve()


def _resolve_rel_roots(
    root: Path,
    values: list[str] | None,
    *,
    default_when_empty: tuple[str, ...] = (".",),
) -> tuple[str, ...]:
    # Older versions returned (".",) for empty input, which made sense for
    # include_roots (empty means "everything") but silently turned empty
    # exclude_roots into "exclude everything" — root scans then produced
    # zero files. Callers now opt into the default explicitly.
    if not values:
        return default_when_empty

    resolved: list[str] = []
    for raw_value in values:
        candidate = Path(raw_value)
        if candidate.is_absolute():
            try:
                rel_value = candidate.resolve().relative_to(root)
            except ValueError as exc:
                raise ValueError(
                    f"profile path '{raw_value}' must be inside root '{root}'"
                ) from exc
        else:
            rel_value = candidate
        resolved.append(_normalize_rel_root(rel_value.as_posix()))
    return tuple(dict.fromkeys(resolved))


def _normalize_ignore_globs(values: list[str] | None) -> tuple[str, ...]:
    if not values:
        return ()
    return tuple(dict.fromkeys(v.replace("\\", "/").strip() for v in values if v.strip()))


def _posix_rel_path(path: str) -> str:
    normalized = path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def _matches_root_prefix(rel_path: str, root_entry: str) -> bool:
    if root_entry == ".":
        return True
    return rel_path == root_entry or rel_path.startswith(f"{root_entry}/")


@dataclass(frozen=True)
class WorkspaceProfile:
    name: str
    root: Path
    include_roots: tuple[str, ...]
    exclude_roots: tuple[str, ...]
    ignore_globs: tuple[str, ...]
    profile_path: Path | None
    resolution_reason: str

    @property
    def effective_ignore_globs(self) -> tuple[str, ...]:
        return DEFAULT_IGNORE_GLOBS + self.ignore_globs

    def includes_path(self, rel_path: str) -> bool:
        normalized = _posix_rel_path(rel_path)
        if not normalized:
            return False

        if self.include_roots and not any(
            _matches_root_prefix(normalized, entry) for entry in self.include_roots
        ):
            return False

        if any(_matches_root_prefix(normalized, entry) for entry in self.exclude_roots):
            return False

        path_obj = PurePosixPath(normalized)
        for pattern in self.effective_ignore_globs:
            if fnmatch(normalized, pattern) or path_obj.match(pattern):
                return False
        return True


def load_workspace_profile(
    profile_path: str | os.PathLike[str],
    *,
    root_override: str | os.PathLike[str] | None = None,
    resolution_reason: str = "explicit-profile",
) -> WorkspaceProfile:
    profile_file = Path(profile_path).expanduser().resolve()
    data = json.loads(profile_file.read_text(encoding="utf-8"))
    profile_root = _resolve_profile_root(profile_file.parent, data.get("root"))
    if root_override is not None:
        profile_root = _as_path(root_override) or profile_root

    include_roots = _resolve_rel_roots(profile_root, data.get("include_roots"))
    exclude_roots = _resolve_rel_roots(
        profile_root,
        data.get("exclude_roots") or [],
        default_when_empty=(),
    )
    ignore_globs = _normalize_ignore_globs(data.get("ignore_globs"))

    return WorkspaceProfile(
        name=data.get("name") or profile_file.stem,
        root=profile_root,
        include_roots=include_roots,
        exclude_roots=exclude_roots,
        ignore_globs=ignore_globs,
        profile_path=profile_file,
        resolution_reason=resolution_reason,
    )


def resolve_workspace(
    *,
    start_path: str | os.PathLike[str] | None = None,
    root_override: str | os.PathLike[str] | None = None,
    profile_path: str | os.PathLike[str] | None = None,
) -> WorkspaceProfile:
    start = _as_path(start_path) or Path.cwd().resolve()
    env_profile = os.environ.get("MUSU_INDEXER_PROFILE")
    env_root = os.environ.get("MUSU_INDEXER_ROOT")

    explicit_profile = _as_path(profile_path)
    if explicit_profile is not None:
        return load_workspace_profile(
            explicit_profile,
            root_override=root_override,
            resolution_reason="explicit-profile",
        )

    if env_profile:
        return load_workspace_profile(
            env_profile,
            root_override=root_override,
            resolution_reason="env-profile",
        )

    discovered_profile = _find_in_parents(start, PROFILE_FILE_NAME)
    if discovered_profile is not None:
        return load_workspace_profile(
            discovered_profile,
            root_override=root_override,
            resolution_reason="discovered-profile",
        )

    explicit_root = _as_path(root_override)
    if explicit_root is not None:
        return WorkspaceProfile(
            name=explicit_root.name,
            root=explicit_root,
            include_roots=(".",),
            exclude_roots=(),
            ignore_globs=(),
            profile_path=None,
            resolution_reason="explicit-root",
        )

    if env_root:
        env_root_path = _as_path(env_root)
        return WorkspaceProfile(
            name=env_root_path.name,
            root=env_root_path,
            include_roots=(".",),
            exclude_roots=(),
            ignore_globs=(),
            profile_path=None,
            resolution_reason="env-root",
        )

    git_marker = _find_in_parents(start, ".git")
    if git_marker is not None:
        git_root = git_marker.parent
        return WorkspaceProfile(
            name=git_root.name,
            root=git_root,
            include_roots=(".",),
            exclude_roots=(),
            ignore_globs=(),
            profile_path=None,
            resolution_reason="git-root",
        )

    return WorkspaceProfile(
        name=start.name,
        root=start,
        include_roots=(".",),
        exclude_roots=(),
        ignore_globs=(),
        profile_path=None,
        resolution_reason="cwd-fallback",
    )


def find_project_root(
    start_path: str | os.PathLike[str] | None = None,
    *,
    root_override: str | os.PathLike[str] | None = None,
    profile_path: str | os.PathLike[str] | None = None,
) -> Path:
    return resolve_workspace(
        start_path=start_path,
        root_override=root_override,
        profile_path=profile_path,
    ).root


def matches_scope(rel_path: str, scope: str) -> bool:
    if scope == "all":
        return True

    normalized = _posix_rel_path(rel_path)
    suffix = Path(normalized).suffix.lower()
    basename = Path(normalized).name.lower()
    is_doc = (
        suffix in DOC_EXTENSIONS
        or basename in DOC_FILENAMES
        or normalized.startswith("docs/")
        or normalized.startswith("references/")
    )

    if scope == "doc":
        return is_doc
    if scope == "code":
        return not is_doc and suffix in CODE_EXTENSIONS
    return True


def should_index_path(rel_path: str, scope: str, workspace: WorkspaceProfile) -> bool:
    return workspace.includes_path(rel_path) and matches_scope(rel_path, scope)
