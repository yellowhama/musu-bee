//! Workspace Context Synchronization
//!
//! Handles packing a directory into a ZIP archive for task forwarding,
//! and unpacking it on the target node.
//!
//! Skips `.git`, `node_modules`, `target`, and `.musu` to keep archives lightweight.

use anyhow::{Context, Result};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use walkdir::WalkDir;
use zip::write::FileOptions;
use zip::ZipWriter;

/// Packs a workspace directory into a ZIP file.
#[allow(dead_code)] // Reserved for context-forwarding; unpack path is active today.
pub fn pack_workspace(src_dir: &Path, dest_zip: &Path) -> Result<()> {
    tracing::debug!(src = %src_dir.display(), dest = %dest_zip.display(), "Packing workspace");

    let file = File::create(dest_zip).context("Failed to create zip file")?;
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    let walker = WalkDir::new(src_dir).into_iter();
    for entry in walker.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !name.starts_with(".git") && name != "node_modules" && name != "target" && name != ".musu"
    }) {
        let entry = entry.context("Failed to read directory entry")?;
        let path = entry.path();

        let name = path
            .strip_prefix(src_dir)
            .context("Failed to strip prefix from path")?;

        // Convert to a forward-slash separated path for the ZIP archive
        let zip_name = name.to_string_lossy().replace("\\", "/");

        if path.is_file() {
            tracing::trace!("Adding file to ZIP: {}", zip_name);
            zip.start_file(zip_name, options)
                .context("Failed to start file in zip")?;
            let mut f = File::open(path).context("Failed to open file for zipping")?;
            let mut buffer = Vec::new();
            f.read_to_end(&mut buffer)
                .context("Failed to read file content")?;
            zip.write_all(&buffer).context("Failed to write to zip")?;
        } else if !name.as_os_str().is_empty() {
            zip.add_directory(zip_name, options)
                .context("Failed to add directory to zip")?;
        }
    }
    zip.finish().context("Failed to finish zip archive")?;
    tracing::debug!("Workspace packed successfully");
    Ok(())
}

/// Unpacks a ZIP file into a destination directory.
pub fn unpack_workspace(zip_path: &Path, dest_dir: &Path) -> Result<()> {
    tracing::debug!(zip = %zip_path.display(), dest = %dest_dir.display(), "Unpacking workspace");

    let file = File::open(zip_path).context("Failed to open zip file")?;
    let mut archive = zip::ZipArchive::new(file).context("Failed to read zip archive")?;

    std::fs::create_dir_all(dest_dir).context("Failed to create destination directory")?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .context("Failed to get zip entry by index")?;
        let outpath = match file.enclosed_name() {
            Some(path) => dest_dir.join(path),
            None => continue, // Skip malicious or absolute paths
        };

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).context("Failed to create extracted directory")?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p)
                        .context("Failed to create parent directory for file")?;
                }
            }
            let mut outfile = File::create(&outpath).context("Failed to create extracted file")?;
            std::io::copy(&mut file, &mut outfile)
                .context("Failed to copy zip contents to file")?;
        }
    }

    // Explicitly grant permissions if needed
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for i in 0..archive.len() {
            let file = archive.by_index(i)?;
            if let Some(mode) = file.unix_mode() {
                if let Some(outpath) = file.enclosed_name().map(|p| dest_dir.join(p)) {
                    if outpath.exists() {
                        let _ = std::fs::set_permissions(
                            &outpath,
                            std::fs::Permissions::from_mode(mode),
                        );
                    }
                }
            }
        }
    }

    tracing::debug!("Workspace unpacked successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_pack_and_unpack_workspace() {
        let src_dir = tempdir().unwrap();
        let dest_dir = tempdir().unwrap();
        let zip_dir = tempdir().unwrap();
        let zip_file = zip_dir.path().join("test.zip");

        // Create some files
        let file1 = src_dir.path().join("file1.txt");
        let file2 = src_dir.path().join("file2.txt");
        fs::write(&file1, "Hello").unwrap();
        fs::write(&file2, "World").unwrap();

        // Create a directory
        let subdir = src_dir.path().join("subdir");
        fs::create_dir(&subdir).unwrap();
        let file3 = subdir.join("file3.txt");
        fs::write(&file3, "Subdir").unwrap();

        // Create an ignored directory
        let ignored_dir = src_dir.path().join("node_modules");
        fs::create_dir(&ignored_dir).unwrap();
        let file4 = ignored_dir.join("file4.txt");
        fs::write(&file4, "Ignored").unwrap();

        // Pack the workspace
        pack_workspace(src_dir.path(), &zip_file).unwrap();
        assert!(zip_file.exists());

        // Unpack the workspace
        unpack_workspace(&zip_file, dest_dir.path()).unwrap();

        // Check if files exist
        assert!(dest_dir.path().join("file1.txt").exists());
        assert!(dest_dir.path().join("file2.txt").exists());
        assert!(dest_dir.path().join("subdir/file3.txt").exists());

        // Check if ignored directory does not exist
        assert!(!dest_dir.path().join("node_modules").exists());

        // Check file contents
        assert_eq!(
            fs::read_to_string(dest_dir.path().join("file1.txt")).unwrap(),
            "Hello"
        );
        assert_eq!(
            fs::read_to_string(dest_dir.path().join("subdir/file3.txt")).unwrap(),
            "Subdir"
        );
    }
}
