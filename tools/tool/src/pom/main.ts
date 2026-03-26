import { displayHistory } from "./history"
import { runPomApp } from "./app"

export function pomMain(args: string[]) {
  if (args[0] === "-h") {
    const count = args[1] ? parseInt(args[1], 10) || 5 : 5
    displayHistory(count)
    return
  }

  let minutes = 25
  let task = ""

  if (args.length > 0) {
    const n = parseInt(args[0], 10)
    if (!isNaN(n)) {
      minutes = n
      task = args.slice(1).join(" ")
    } else {
      task = args.join(" ")
    }
  }

  runPomApp(minutes, task)
}
