#!/usr/bin/env bash

set -eu

usage() {
  echo "Usage: $0 [ --d ] [ --s ] [ --h ] [ --v[1|2] ] [--stdin] <filename>
    --d - development mode, uses nodemon instead of node
    --s - silent mode, no output at all
    --v - verbosity, shows debug output on application level
    --v1 - enhanced verbosity, shows debug output on application and http-server level
    --v2 - full verbosity, shows all debug output
    --stdin - uses stdin to read JavaScript
    --keyStore - json string. Array of objects with keys: id, key, cert. Where id is the cpName, key the filename to the key file, cert the filename to the cert file. All PEM encoded.
    --keyStoreRoot - path where newly created keys/certs are being stored
    --ca - path to PEM encoded CA certificate file
    --cadir - path to PEM encoded CA certificate dir
    --o - path to a options file which will be sourced
    --h - shows this help
  " 1>&2
}
exit_abnormal() {
  usage
  exit 1
}

if ! npm --version >/dev/null 2>&1; then
  echo "npm not installed. Abort."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  npm i
fi

DEV=
STDIN=

while [[ "${1:-}" =~ ^- ]] ; do
  case "${1}" in
    -h)
      usage
      exit 0
      ;;
    --h)
      usage
      exit 0
      ;;
    -help)
      usage
      exit 0
      ;;
    --help)
      usage
      exit 0
      ;;
    --d)
      DEV=TRUE
      ;;
    --v)
      export DEBUG=ocpp-chargepoint-simulator:simulator:*
      ;;
    --v1)
      export DEBUG=ocpp-chargepoint-simulator:*
      ;;
    --v2)
      export DEBUG=*
      ;;
    --vv)
      export DEBUG=$2
      shift
      ;;
    --s)
      export DEBUG=.
      ;;
    --keyStore)
      export SSL_CLIENT_KEYSTORE=$2
      shift
      ;;
    --keyStoreRoot)
      export SSL_CLIENT_KEYSTORE_ROOT=$2
      shift
      ;;
    --ca)
      export SSL_CERT_FILE=$2
      shift
      ;;
    --cadir)
      export SSL_CERT_DIR=$2
      shift
      ;;
    --o)
      SIMULATOR_OPTS=$2
      shift
      ;;
    --stdin)
      STDIN=--stdin
      ;;
    *)
      exit_abnormal
  esac
  shift
done

if [ -n "${SIMULATOR_OPTS:-}" ]; then
  . ${SIMULATOR_OPTS}
fi

if [ -z "${DEBUG:-}" ]; then
    echo "No debug output configured."
fi

if [ -n "$DEV" ]; then
  [ -n "$STDIN" ] && echo "You cannot combine dev and stdin" && exit 1
  npm run dev "$@"
else
  if [ -n "${SSL_CERT_FILE:-}" ] || [ -n "${SSL_CERT_DIR:-}" ]; then
    # nasty special case, but the environment variable SSL_CERT_FILE or SSL_CERT_DIR requires to also set --use-openssl-ca on node (not ts-node)
    node --use-openssl-ca ./node_modules/.bin/ts-node --project ./tsconfig.release.json ./src/main.ts $STDIN "$@"
  else
    ./node_modules/.bin/ts-node --project ./tsconfig.release.json ./src/main.ts $STDIN "$@"
  fi
fi
