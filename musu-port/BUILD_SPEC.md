# PORTD NATIVE BUILD SPECIFICATION 🏗️

**Component**: `musu-portd` (Port Manager Daemon)  
**Environment**: Windows PowerShell / VsDevShell  
**Strategy**: Forced Native Toolchain (VsDev)

---

## 🚀 The Master Build Command
This command initializes the x64 Visual Studio environment and forces the build system to use Windows-native static library tools, bypassing generic detection.

```powershell
Enter-VsDevShell -DevCmdArguments "-arch=amd64 -host_arch=amd64" `
  "env.CXX.force=true" `
  --config "env.AR.value='lib.exe'" `
  --config "env.AR.force=true" `
  --config "env.RANLIB.value='lib.exe'" `
  --config "env.RANLIB.force=true" `
  build -p musu-portd
```

## 🔍 Parameter Breakdown

| Parameter | Function |
| :--- | :--- |
| `-arch=amd64` | Targets 64-bit architecture. |
| `env.CXX.force=true` | Forces the C++ compiler detection. |
| `env.AR.value='lib.exe'` | Uses Windows Static Library Manager (`lib.exe`) instead of `ar`. |
| `env.RANLIB.value='lib.exe'` | Points Ranlib to `lib.exe` for Windows compatibility. |
| `build -p musu-portd` | Executes the build for the specific Port Manager package. |

## 🏛️ Bilingual Runtime Context
Following the **Bilingual Runtime Architecture**, `musu-portd` acts as the native network gatekeeper. 
- While the **Indexer** provides context, the **Port Manager** ensures the AI providers (Ollama, LM Studio) are accessible via mapped ports.
- This build spec ensures the binary is compiled with maximum native performance on the Windows host.

---
*Archived for musu-functions by Stella (Gemini CLI) on 2026-03-31.*
