import { pomMain } from "./pom/main"
import { queryMain } from "./query/main"
import { wsMain } from "./ws/main"

const [cmd, ...args] = process.argv.slice(2)

switch (cmd) {
  case "pom":
    pomMain(args)
    break
  case "q":
    queryMain(args)
    break
  case "ws":
    wsMain(args)
    break
  default:
    console.log("usage: tool <pom|q|ws> [args...]")
    process.exit(1)
}
