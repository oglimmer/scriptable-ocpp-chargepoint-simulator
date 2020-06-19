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
    --key - path to PEM encoded private key file
    --cert - path to PEM encoded client certificate file
    --ca - path to PEM encoded CA certificate file
    --h - shows this help
  " 1>&2
}
exit_abnormal() {
  usage
  exit 1
}

BIN=node
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
      BIN=nodemon
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
    --s)
      export DEBUG=.
      ;;
    --key)
      export SSL_CLIENT_KEY_FILE=$2
      shift
      ;;
    --cert)
      export SSL_CLIENT_CERT_FILE=$2
      shift
      ;;
    --ca)
      export SSL_CERT_FILE=$2
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

if [ -z "${DEBUG:-}" ]; then
    echo "No debug output configured."
fi

$BIN build/src/main.js $STDIN "$@"
