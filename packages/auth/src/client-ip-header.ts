/**
 * The only header Better Auth reads a client IP from. The API sets it from the socket peer and its
 * trusted proxies and drops any client-supplied copy, so a caller cannot choose its own address.
 */
export const CLIENT_IP_HEADER = "x-rakazo-client-ip";
