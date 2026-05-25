"use client";

import { useState, useEffect, useRef } from "react";
import { Tree } from "react-arborist";
import { VscFolder, VscFolderOpened, VscFile, VscRefresh } from "react-icons/vsc";

interface RemoteFileExplorerProps {
  machineId: string;
}

type TreeNode = {
  id: string; // full path
  name: string;
  isDir: boolean;
  children?: TreeNode[];
};

export default function RemoteFileExplorer({ machineId }: RemoteFileExplorerProps) {
  const [data, setData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string, isDir: boolean, name: string } | null>(null);

  const fetchDir = async (path: string): Promise<TreeNode[]> => {
    const res = await fetch(`/api/v1/proxy/files?node_id=${machineId}&path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.children.map((c: any) => ({
      id: c.path,
      name: c.name,
      isDir: c.is_dir,
      children: c.is_dir ? [] : null
    }));
  };

  const loadRoot = async () => {
    setLoading(true);
    setError(null);
    try {
      const children = await fetchDir(".");
      setData([{ id: ".", name: "Workspace Root", isDir: true, children }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load root");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoot();
  }, [machineId]);

  // Click outside to close context menu
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const updateNodeChildren = (nodes: TreeNode[], targetId: string, newChildren: TreeNode[]): TreeNode[] => {
    return nodes.map(node => {
      if (node.id === targetId) {
        return { ...node, children: newChildren };
      }
      if (node.children) {
        return { ...node, children: updateNodeChildren(node.children, targetId, newChildren) };
      }
      return node;
    });
  };

  const handleToggle = async (id: string) => {
    try {
      const children = await fetchDir(id);
      setData(prev => updateNodeChildren(prev, id, children));
    } catch (err) {
      console.error("Failed to load dir", err);
    }
  };

  const loadFile = async (path: string) => {
    setSelectedFile(path);
    setLoadingFile(true);
    setFileError(null);
    setFileContent("");
    try {
      const res = await fetch(`/api/v1/proxy/files/read?node_id=${machineId}&path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const text = await res.text();
      setFileContent(text);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setLoadingFile(false);
    }
  };

  // Cross-machine DND handler
  const handleDrop = async (e: React.DragEvent, targetDirId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const payload = JSON.parse(raw);
      
      if (payload.sourceMachine !== machineId) {
        console.log(`Cross-machine transfer: ${payload.sourcePath} from ${payload.sourceMachine} to ${machineId}/${targetDirId}`);
        // 1. Read file blob
        const readRes = await fetch(`/api/v1/proxy/files/read?node_id=${payload.sourceMachine}&path=${encodeURIComponent(payload.sourcePath)}`);
        if (!readRes.ok) throw new Error("Failed to read source file");
        const blob = await readRes.blob();
        
        // 2. Write file
        // targetDirId could be '.', we just append the filename
        const destPath = targetDirId === "." ? payload.name : `${targetDirId}/${payload.name}`;
        
        const writeRes = await fetch(`/api/v1/proxy/files/write?node_id=${machineId}&path=${encodeURIComponent(destPath)}`, {
          method: "POST",
          body: blob,
        });
        if (!writeRes.ok) throw new Error("Failed to write to target machine");
        
        // Refresh the target directory
        handleToggle(targetDirId);
      }
    } catch (err) {
      console.error("DND Error", err);
      alert(`Transfer failed: ${err}`);
    }
  };

  // Context Menu Actions
  const handleOpenInTerminal = (path: string, isDir: boolean) => {
    const target = isDir ? path : (path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ".");
    const command = `cd "${target}"\n`;
    document.dispatchEvent(new CustomEvent("fleet-terminal-command", { detail: { machineId, command } }));
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    try {
      await fetch(`/api/v1/proxy/files?node_id=${machineId}&path=${encodeURIComponent(path)}`, { method: "DELETE" });
      loadRoot(); // Simplest way to refresh is loadRoot, ideally just refresh parent
    } catch (err) {
      alert("Delete failed");
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "#1a1a1a", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-default)", position: "relative" }}>
      {/* Left Pane: Tree View */}
      <div style={{ width: "250px", display: "flex", flexDirection: "column", borderRight: "1px solid var(--border-default)" }}>
        <div style={{ padding: "8px 12px", background: "#111", borderBottom: "1px solid var(--border-default)", fontSize: 12, fontWeight: 700, color: "var(--fg2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>EXPLORER</span>
          <button onClick={loadRoot} style={{ background: "none", border: "none", color: "var(--fg3)", cursor: "pointer" }} title="Refresh">
            <VscRefresh />
          </button>
        </div>
        <div style={{ flex: 1, padding: 8, overflowY: "auto", overflowX: "hidden" }}>
          {error ? (
            <div style={{ color: "var(--status-error)", fontSize: 12 }}>{error}</div>
          ) : loading ? (
            <div style={{ color: "var(--fg3)", fontSize: 12 }}>Loading...</div>
          ) : (
            <Tree
              data={data}
              width={230}
              rowHeight={24}
              indent={12}
              onToggle={(id) => handleToggle(id)}
            >
              {({ node, style, dragHandle }) => {
                const isDir = node.data.isDir;
                return (
                  <div 
                    style={{
                      ...style,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0 4px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "'Space Mono', monospace",
                      color: node.isSelected ? "var(--fg1)" : "var(--fg2)",
                      background: node.isSelected ? "var(--bg-active)" : "transparent",
                    }}
                    ref={dragHandle}
                    draggable={!isDir} // Only allow dragging files for now
                    onDragStart={(e) => {
                      if (!isDir) {
                        e.dataTransfer.setData("application/json", JSON.stringify({
                          sourceMachine: machineId,
                          sourcePath: node.id,
                          name: node.data.name
                        }));
                      }
                    }}
                    onDragOver={(e) => {
                      if (isDir) {
                        e.preventDefault(); // allow drop
                      }
                    }}
                    onDrop={(e) => {
                      if (isDir) {
                        handleDrop(e, node.id);
                      }
                    }}
                    onClick={() => {
                      if (isDir) {
                        node.toggle();
                        if (node.isOpen) handleToggle(node.id);
                      } else {
                        node.select();
                        loadFile(node.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, id: node.id, isDir, name: node.data.name });
                    }}
                  >
                    <span style={{ color: "var(--fg3)", display: "flex", alignItems: "center" }}>
                      {isDir ? (node.isOpen ? <VscFolderOpened /> : <VscFolder />) : <VscFile />}
                    </span>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {node.data.name}
                    </span>
                  </div>
                );
              }}
            </Tree>
          )}
        </div>
      </div>

      {/* Right Pane: File Content Viewer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
        <div style={{ padding: "8px 12px", background: "#111", borderBottom: "1px solid var(--border-default)", fontSize: 12, fontWeight: 700, color: "var(--fg3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedFile || "No file selected"}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {loadingFile ? (
            <div style={{ color: "var(--fg3)", fontSize: 12 }}>Loading file content...</div>
          ) : fileError ? (
            <div style={{ color: "var(--status-error)", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>
              {fileError}
            </div>
          ) : selectedFile ? (
            <pre style={{ 
              margin: 0, 
              fontFamily: "'Space Mono', monospace", 
              fontSize: 12, 
              color: "var(--fg1)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            }}>
              {fileContent}
            </pre>
          ) : (
            <div style={{ color: "var(--fg3)", fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 20 }}>
              Select a file to view its contents.
            </div>
          )}
        </div>
      </div>

      {/* Context Menu Dropdown */}
      {contextMenu && (
        <div 
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "#222",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "4px 0",
            zIndex: 9999,
            minWidth: 150,
            boxShadow: "4px 4px 0 rgba(0,0,0,0.5)",
            fontFamily: "'Space Mono', monospace",
            fontSize: 12
          }}
          onClick={(e) => e.stopPropagation()} // prevent closing immediately
        >
          <div style={{ padding: "4px 12px", color: "var(--fg3)", borderBottom: "1px solid var(--border-default)", marginBottom: 4, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {contextMenu.name}
          </div>
          <div 
            style={{ padding: "6px 12px", cursor: "pointer", color: "var(--fg1)" }} 
            onClick={() => { handleOpenInTerminal(contextMenu.id, contextMenu.isDir); setContextMenu(null); }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-active)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Open in Terminal
          </div>
          <div 
            style={{ padding: "6px 12px", cursor: "pointer", color: "var(--fg1)" }} 
            onClick={() => { navigator.clipboard.writeText(contextMenu.id); setContextMenu(null); }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-active)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Copy Path
          </div>
          <div 
            style={{ padding: "6px 12px", cursor: "pointer", color: "var(--status-error)" }} 
            onClick={() => { handleDelete(contextMenu.id); setContextMenu(null); }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,50,50,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Delete
          </div>
        </div>
      )}
    </div>
  );
}
