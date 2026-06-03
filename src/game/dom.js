const getRequiredElement = (selector) => {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
};

const platformElements = Array.from(document.querySelectorAll("[data-platform]"));

export const elements = {
  stage: getRequiredElement("[data-stage]"),
  scoreValue: getRequiredElement("[data-score]"),
  chargeMeter: getRequiredElement("[data-charge-meter]"),
  chargeFill: getRequiredElement("[data-charge-fill]"),
  clawdBody: getRequiredElement("[data-clawd-body]"),
  clawdSmear: getRequiredElement("[data-clawd-smear]"),
  clawdVelocity: getRequiredElement("[data-clawd-velocity]"),
  bodyLeftArm: getRequiredElement("[data-left-arm]"),
  bodyRightArm: getRequiredElement("[data-right-arm]"),
  smearLeftArm: getRequiredElement("[data-left-arm-smear]"),
  smearRightArm: getRequiredElement("[data-right-arm-smear]"),
  spikes: getRequiredElement("[data-spikes]"),
  spikesSvg: getRequiredElement("[data-spikes-svg]"),
  spikesPath: getRequiredElement("[data-spikes-path]"),
  bottomSpikes: getRequiredElement("[data-bottom-spikes]"),
  bottomSpikesSvg: getRequiredElement("[data-bottom-spikes-svg]"),
  bottomSpikesPath: getRequiredElement("[data-bottom-spikes-path]"),
  platforms: Object.fromEntries(
    platformElements.map((platform) => [platform.dataset.platform, platform]),
  ),
};

export const platformIds = platformElements.map(
  (platform) => platform.dataset.platform,
);
