/** Capture Bash/Zsh functions and aliases without changing their bytes. */
export function getUserSnapshotContent(configFile) : string {
  const isZsh = configFile.endsWith('.zshrc')
  let content = ''
  if (isZsh) {
    content += `
      echo "# Functions" >> "$SNAPSHOT_FILE"
      typeset -f > /dev/null 2>&1
      typeset +f | grep -vE '^_[^_]' | while read func; do
        typeset -f "$func" >> "$SNAPSHOT_FILE"
      done
      echo "# Shell Options" >> "$SNAPSHOT_FILE"
      setopt | sed 's/^/setopt /' | head -n 1000 >> "$SNAPSHOT_FILE"
    `
  } else {
    content += `
      echo "# Shopt" >> "$SNAPSHOT_FILE"
      shopt -p >> "$SNAPSHOT_FILE"
      echo "# Functions" >> "$SNAPSHOT_FILE"
      declare -f > /dev/null 2>&1
      declare -F | while read func; do
        func=\${func##* }
        if [[ "$func" == [-+]* ]]; then
          printf 'eval -- %q > /dev/null 2>&1\\n' "$(declare -f -- "$func")" >> "$SNAPSHOT_FILE"
        else
          [[ "$func" == _[!_]* ]] ||
            printf 'eval %q > /dev/null 2>&1\\n' "$(declare -f "$func")" >> "$SNAPSHOT_FILE"
        fi
      done
      echo "# Shell Options" >> "$SNAPSHOT_FILE"
      set -o | awk '$2 == "on" || $1 == "monitor" {print "set -o " $1}' >> "$SNAPSHOT_FILE"
      echo "shopt -s expand_aliases" >> "$SNAPSHOT_FILE"
    `
  }
  content += `
      echo "# Aliases" >> "$SNAPSHOT_FILE"
      if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        alias | sed -e "/='winpty /d" | sed -e '1001,$d' -e 's/^alias //g' -e 's/^/alias -- /' >> "$SNAPSHOT_FILE"
      else
        ${isZsh ? "alias | sed -e '1001,$d' -e 's/^alias //g' -e 's/^/alias -- /'" : "\\alias -p | sed -e '1001,$d' -e 's/^alias -- /alias /' -e 's/^alias /alias -- /'"} >> "$SNAPSHOT_FILE"
      fi
    `
  return content
}
