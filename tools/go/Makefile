BINS = pom query ws
OUTPUT = $(HOME)/bin/tools

.PHONY: all $(BINS) check vet fmt

all: check $(BINS)

check: vet fmt

vet:
	go vet ./...

fmt:
	@test -z "$$(gofmt -l .)" || (gofmt -l . && exit 1)

pom:
	go build -o $(OUTPUT)/pom ./cmd/pom

query:
	go build -o $(OUTPUT)/query ./cmd/query

ws:
	go build -o $(OUTPUT)/ws ./cmd/ws
