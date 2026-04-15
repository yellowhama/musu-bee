bash -lc ps -eo pid=,comm=,args= | awk 'tolower($0) ~ /pencil|apprun|electron/ && tolower($0) !~ /mcp-server-linux-x64/'
