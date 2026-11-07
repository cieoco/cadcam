// 使用者先展開家族，再選既有穩定 ID 的範例。
exports.revealExample = async (page, id) => {
  const button = page.locator(`[data-example-id="${id}"]`);
  await button.waitFor({state:'attached'});
  const family = button.locator('xpath=ancestor::details[1]');
  if (await family.count() && await family.getAttribute('open') === null) await family.locator('summary').click();
};
