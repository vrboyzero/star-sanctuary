export function applyWebConfigLinks(refs, webConfig = {}) {
  const linkMappings = [
    [refs.recommendApiLink, webConfig.recommendApiUrl],
    [refs.aliyunOneKeyLink, webConfig.aliyunOneKeyUrl],
    [refs.officialHomeLink, webConfig.officialHomeUrl],
    [refs.workshopLink, webConfig.workshopUrl],
  ];

  for (const [element, href] of linkMappings) {
    if (element && href) {
      element.href = href;
    }
  }
}
