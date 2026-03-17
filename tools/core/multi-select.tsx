import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface Option<T> {
  value: T;
  label: string;
  dim?: boolean;
}

interface MultiSelectProps<T> {
  message: string;
  options: Option<T>[];
  onSubmit: (values: T[]) => void;
  onCancel?: () => void;
  initialSelected?: Set<number>;
  exclusiveFirst?: boolean;
}

export function MultiSelect<T>({ message, options, onSubmit, onCancel, initialSelected, exclusiveFirst }: MultiSelectProps<T>) {
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(initialSelected ?? new Set());

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    } else if (key.return) {
      onSubmit(Array.from(selected).sort().map((i) => options[i].value));
    } else if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : options.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < options.length - 1 ? c + 1 : 0));
    } else if (input === " ") {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(cursor)) {
          next.delete(cursor);
        } else {
          next.add(cursor);
          if (exclusiveFirst) {
            if (cursor === 0) {
              for (let i = 1; i < options.length; i++) next.delete(i);
            } else {
              next.delete(0);
            }
          }
        }
        return next;
      });
    } else if (input === "a") {
      setSelected((s) => {
        if (s.size === options.length) return new Set();
        if (exclusiveFirst) return new Set(options.map((_, i) => i).filter((i) => i !== 0));
        return new Set(options.map((_, i) => i));
      });
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{message}</Text>
      {options.map((opt, i) => (
        <Text key={i}>
          <Text color="cyan">{i === cursor ? ">" : " "}</Text>
          <Text color={selected.has(i) ? "green" : "gray"}>{selected.has(i) ? " ◼" : " ◻"}</Text>
          <Text dimColor={opt.dim}> {opt.label}</Text>
        </Text>
      ))}
      <Text color="gray">space: toggle, a: all, enter: confirm</Text>
    </Box>
  );
}
