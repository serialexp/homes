# TODO

- **Docker Hub secrets for the Gothab image workflow.** `.gothab/workflows/docker.yml` logs in with the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets. They have to be set on the homes repo (or the serialexp namespace) before the first push that should publish images; agents' tokens can't read or list secrets (`secrets:read`).
- **Stale remote branch `release/2026-03-25`.** Left over from the GitHub just-release workflow, which is gone. Delete it on the remote once Bart confirms.
- **Worker starts before MySQL is reachable.** On a cold start of the compose stack the worker can come up before MySQL accepts connections and fail its startup recovery. Wait for the database (healthcheck dependency or a retry on connect) instead of crashing.
- **New mansion projects are stored as one listing each.** A JJ011FC001 card is a project with several sale phases and many units; it is stored as one `Property` with the cheapest phase's price and floor area, and every phase in `price_text`. If per-unit browsing is wanted, that needs a project-shaped model.
