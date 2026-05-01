export const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID

export const dynamicConfigured = Boolean(
  dynamicEnvironmentId &&
    dynamicEnvironmentId !== "undefined" &&
    dynamicEnvironmentId !== "null" &&
    !dynamicEnvironmentId.includes("<")
)
