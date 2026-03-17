import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface Option<T> {
  value: T;
  label: string;
  hint?: string;
}

interface SelectProps<T> {
  message: string;
  options: Option<T>[];
  onSubmit: (value: T) => void;
  onCancel?: () => void;
}

export function Select<T>({ message, options, onSubmit, onCancel }: SelectProps<T>) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    } else if (key.return) {
      onSubmit(options[cursor].value);
    } else if (key.upArrow || input === "k") {
      setCursor((c) => (c > 0 ? c - 1 : options.length - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => (c < options.length - 1 ? c + 1 : 0));
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{message}</Text>
      {options.map((opt, i) => (
        <Text key={i}>
          <Text color="cyan">{i === cursor ? ">" : " "}</Text>
          <Text> {opt.label}</Text>
          {opt.hint && <Text color="gray"> ({opt.hint})</Text>}
        </Text>
      ))}
    </Box>
  );
}
