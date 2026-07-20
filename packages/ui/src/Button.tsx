import { Button as TamaguiButton, styled } from "tamagui";

export const Button = styled(TamaguiButton, {
  name: "Button",
  borderRadius: "$4",
  backgroundColor: "$blue10",
  color: "white",

  hoverStyle: {
    backgroundColor: "$blue9",
  },
  pressStyle: {
    backgroundColor: "$blue8",
  },
});
