export const merchantRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fxThresholdBps", type: "uint16" },
      { name: "risk", type: "uint8" },
      { name: "preferredStablecoin", type: "address" },
      { name: "telegramChatId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "update",
    stateMutability: "nonpayable",
    inputs: [
      { name: "fxThresholdBps", type: "uint16" },
      { name: "risk", type: "uint8" },
      { name: "preferredStablecoin", type: "address" },
      { name: "telegramChatId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deactivate",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "configOf",
    stateMutability: "view",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "fxThresholdBps", type: "uint16" },
          { name: "risk", type: "uint8" },
          { name: "preferredStablecoin", type: "address" },
          { name: "telegramChatId", type: "bytes32" },
          { name: "active", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const
