bash -lc ps -eo pid=,comm=,args= | rg 'mcp-server-linux-x64|pencil' | rg -v 'rg '
