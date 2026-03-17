import { Text, useInput } from "ink";

interface ConfirmProps {
  message: string;
  onSubmit: (value: boolean) => void;
  onCancel?: () => void;
}

export function Confirm({ message, onSubmit, onCancel }: ConfirmProps) {
  useInput((input, key) => {
    if (key.escape) {
      onCancel?.();
    } else if (input === "y" || input === "Y") {
      onSubmit(true);
    } else if (input === "n" || input === "N") {
      onSubmit(false);
    }
  });

  return (
    <Text>
      <Text bold color="cyan">{message}</Text>
      <Text color="gray"> (y/n)</Text>
    </Text>
  );
}
