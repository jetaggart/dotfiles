import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface TextInputProps {
  message: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
  validate?: (value: string) => string | undefined;
  defaultValue?: string;
}

export function TextInput({ message, onSubmit, onCancel, validate, defaultValue = "" }: TextInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    } else if (key.return) {
      const err = validate?.(value);
      if (err) {
        setError(err);
      } else {
        onSubmit(value);
      }
    } else if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      setError("");
    } else if (input && !key.ctrl && !key.meta) {
      setValue((v) => v + input);
      setError("");
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{message}</Text>
      <Text>
        <Text color="green">{value}</Text>
        <Text color="gray">_</Text>
      </Text>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}
