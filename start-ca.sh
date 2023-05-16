#!/usr/bin/env bash

./start.sh --v1 --ca qa/rootCA.crt --keyStore '[{"id":"*", "key": "qa/ocpp-client-key.pem", "cert": "qa/ocpp-client-certificate.pem"}]'
