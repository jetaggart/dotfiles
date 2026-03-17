BINS = pom query ws
OUTPUT = $(HOME)/bin/tools

all: $(BINS)

pom:
	go build -o $(OUTPUT)/pom ./cmd/pom

query:
	go build -o $(OUTPUT)/query ./cmd/query

ws:
	go build -o $(OUTPUT)/ws ./cmd/ws
