
all: shared.ledger
	ledger balance -f $<

shared.ledger: shared.csv index.js mapping.json
	node index.js < shared.csv > $@
