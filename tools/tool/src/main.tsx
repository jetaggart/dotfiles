import { render, Text } from "ink"
import { pomMain } from "./pom/main"
import { queryMain } from "./query/main"
import { wsMain } from "./ws/main"
import { devMain } from "./dev/main"

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
  case "dev":
    await devMain(args)
    break
  default:
    render(<Text color="gray">usage: tool {"<"}pom|q|ws|dev{">"} [args...]</Text>)
    process.exit(1)
}
