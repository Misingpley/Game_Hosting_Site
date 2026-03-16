#!/usr/bin/env bash
set -euo pipefail

echo "[boot] start.sh running..."
echo "[boot] MC_VERSION=${MC_VERSION:-1.20.4} RAM=${RAM:-2G}"

cd /data

# EULA
echo "eula=true" > eula.txt

VERSION="${MC_VERSION:-1.20.4}"
RAMV="${RAM:-2G}"

# Download Paper if missing
if [ ! -f paper.jar ]; then
  echo "[boot] paper.jar not found, resolving latest build for ${VERSION}..."

  BUILD="$(
    curl -fsSL "https://api.papermc.io/v2/projects/paper/versions/${VERSION}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['builds'][-1])"
  )"

  FILE="$(
    curl -fsSL "https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/${BUILD}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['downloads']['application']['name'])"
  )"

  URL="https://api.papermc.io/v2/projects/paper/versions/${VERSION}/builds/${BUILD}/downloads/${FILE}"

  echo "[boot] downloading Paper build=${BUILD} file=${FILE}"
  echo "[boot] url=${URL}"

  curl -fL "${URL}" -o paper.jar
  echo "[boot] download complete."
else
  echo "[boot] paper.jar already exists, skipping download."
fi

echo "[boot] starting minecraft..."
exec java -Xms"${RAMV}" -Xmx"${RAMV}" -jar paper.jar nogui
