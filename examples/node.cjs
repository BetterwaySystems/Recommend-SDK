const RecommendSDK = require("../recommend-sdk-node");

async function main() {
  RecommendSDK.init({ apiUrl: "https://api.example.com", enableLogging: true });
  RecommendSDK.identify({ userId: "u123", anonymousId: "a123" });

  RecommendSDK.trackEvent("page_view", { any: "payload" }, { url: "https://example.com/p/1" });
  await RecommendSDK.trackAction("purchase", { amount: 10000 }, { url: "https://example.com/checkout" });

  const rec = await RecommendSDK.recommend({ context: { external_id: "family/code" } });
  console.log(rec);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

