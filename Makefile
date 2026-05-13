PORT ?= 8000
HOST ?= 127.0.0.1

.PHONY: help serve open stop clean

help:
	@echo "City Bloxx Revamp — make targets"
	@echo ""
	@echo "  make serve    Start a local static server on http://$(HOST):$(PORT)"
	@echo "  make open     Start the server and open it in your browser"
	@echo "  make stop     Stop a server previously started by 'make serve'"
	@echo "  make clean    Remove the .server.pid file"
	@echo ""
	@echo "Override host/port:  make serve PORT=8080 HOST=0.0.0.0"

serve:
	@echo "Serving on http://$(HOST):$(PORT) — press Ctrl+C to stop"
	@python3 -m http.server $(PORT) --bind $(HOST)

open:
	@python3 -m http.server $(PORT) --bind $(HOST) & echo $$! > .server.pid
	@sleep 1
	@(command -v open >/dev/null && open "http://$(HOST):$(PORT)") || \
	 (command -v xdg-open >/dev/null && xdg-open "http://$(HOST):$(PORT)") || \
	 echo "Open http://$(HOST):$(PORT) in your browser"
	@echo "Server PID $$(cat .server.pid) — run 'make stop' to kill it"

stop:
	@if [ -f .server.pid ]; then \
		kill $$(cat .server.pid) 2>/dev/null && echo "Stopped server $$(cat .server.pid)"; \
		rm -f .server.pid; \
	else \
		echo "No .server.pid found"; \
	fi

clean:
	@rm -f .server.pid
