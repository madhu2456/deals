"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

export function ImeSafeInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.nativeEvent.isComposing) {
          event.preventDefault();
          return;
        }
        props.onKeyDown?.(event);
      }}
    />
  );
}
