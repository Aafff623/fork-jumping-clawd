import {
  ANTICIPATION_SCALE_X,
  ARM_MAX_UP_SWING_DEGREES,
  ARM_PIVOTS,
  ARM_TAKEOFF_DOWN_SWING_DEGREES,
  BASELINE_ANIMATION_FPS,
  BOTTOM_DEATH_DURATION_FRAMES,
  BOTTOM_DEATH_EMBED_DEPTH_MAX,
  BOTTOM_DEATH_EMBED_DEPTH_MIN,
  BOTTOM_DEATH_EMBED_DEPTH_RATIO,
  BOTTOM_DEATH_FALL_TILT_DEGREES,
  CHARGE_COLOR_HIGH,
  CHARGE_COLOR_LOW,
  CHARGE_COLOR_PERFECT,
  CHARGE_COLOR_TOP,
  CHARGE_MAX_LIFT_RATIO,
  CHARGE_MAX_MS,
  CHARGE_METER_GAP_RATIO,
  CHARGE_METER_HEIGHT_RATIO,
  CHARGE_METER_STAGE_PADDING,
  CHARGE_METER_WIDTH_RATIO,
  CHARGE_MIN_LIFT_RATIO,
  CHARGE_PERFECT_CLEARANCE_RATIO,
  CLAWD_ASPECT_RATIO,
  CLAWD_BOTTOM_PADDING_RATIO,
  CLAWD_HEIGHT_RATIO,
  CLAWD_JUMP_TIMING,
  CLAWD_SCENE_SCALE,
  CLAWD_TOP_PADDING_RATIO,
  CYCLE_DURATION_FRAMES,
  CURRENT_SURFACE_RATIO,
  JUMP_HANGTIME_LIFT_RATIO,
  LANDING_IMPACT_REFERENCE_SPEED_RATIO,
  MAX_CLAWD_HEIGHT,
  MIN_CLAWD_HEIGHT,
  PLATFORM_COLOR,
  PLATFORM_SURFACE_MAX_RATIO,
  PLATFORM_SURFACE_MIN_RATIO,
  PLATFORM_VISUAL_THICKNESS_MIN,
  PLATFORM_VISUAL_THICKNESS_MULTIPLIER,
  PLATFORM_WIDTH_MAX_RATIO,
  PLATFORM_WIDTH_MIN_RATIO,
  RESPAWN_FLASH_DURATION_MS,
  SPIKE_HEIGHT_MAX,
  SPIKE_HEIGHT_MIN,
  SPIKE_HEIGHT_RATIO,
  SPIKE_WIDTH_TO_HEIGHT_RATIO,
  TAKEOFF_SMEAR_MAX_EXTRA_SCALE_Y,
  TAKEOFF_SMEAR_MAX_OPACITY,
  TARGET_HORIZONTAL_DISTANCE_MAX_RATIO,
  TARGET_HORIZONTAL_DISTANCE_MIN_RATIO,
  TARGET_VERTICAL_GAP_MAX_RATIO,
  TARGET_VERTICAL_GAP_MIN_RATIO,
  TOP_DEATH_DURATION_FRAMES,
  TOP_DEATH_FALL_DISTANCE_RATIO,
  TOP_DEATH_FALL_FRAMES,
  TOP_DEATH_FALL_TILT_DEGREES,
  TOP_DEATH_IMPACT_HOLD_FRAMES,
} from "./config.js";
import {
  getClawdArmSwingDegrees,
  getClawdJumpState,
  getRenderFrameFromAnimationFrame,
  getSmearSkewDegrees,
  getSmearTrailDirectionY,
  getTakeoffSmearSpeedFactors,
  getVelocityStretch,
} from "./clawd-motion.js";
import { elements, platformIds } from "./dom.js";
import {
  clamp,
  clamp01,
  easeOutQuart,
  getRandomBetween,
  lerp,
  pickRandom,
} from "./math.js";

const {
  stage,
  scoreValue,
  chargeMeter,
  chargeFill,
  clawdBody,
  clawdSmear,
  clawdVelocity,
  bodyLeftArm,
  bodyRightArm,
  smearLeftArm,
  smearRightArm,
  spikes,
  spikesSvg,
  spikesPath,
  bottomSpikes,
  bottomSpikesSvg,
  bottomSpikesPath,
  platforms,
} = elements;

let stageSize = { width: 0, height: 0 };
let platformThickness = 4;
let platformVisualThickness = 8;
let spikeHeight = 36;
let initialized = false;
let frameRequest = 0;
// World surface height that maps to the current ledge position on screen.
let cameraSurfaceY = 0;

const clawdSize = {
  height: 150,
  width: 150 * CLAWD_ASPECT_RATIO,
  topPadding: 150 * CLAWD_TOP_PADDING_RATIO,
  bottomPadding: 150 * CLAWD_BOTTOM_PADDING_RATIO,
};

const createPlatformMap = (createValue) =>
  Object.fromEntries(platformIds.map((id) => [id, createValue(id)]));

const JUMP_RELEASE_START_FRAME = getRenderFrameFromAnimationFrame({
  animationFrame: CLAWD_JUMP_TIMING.jumpStartFrame,
  fps: BASELINE_ANIMATION_FPS,
});
const JUMP_CAMERA_START_FRAME = getRenderFrameFromAnimationFrame({
  animationFrame: CLAWD_JUMP_TIMING.landingFrame,
  fps: BASELINE_ANIMATION_FPS,
});
const JUMP_CAMERA_DURATION_FRAMES = Math.max(
  1,
  CYCLE_DURATION_FRAMES - JUMP_CAMERA_START_FRAME,
);
const getJumpCameraProgress = (progress) => {
  const p = clamp01(progress);

  return p * p * (3 - 2 * p);
};

const platformPositions = createPlatformMap(() => ({ x: 0, surfaceY: 0 }));
const platformWidths = createPlatformMap(() => 0);
const platformGenerated = createPlatformMap(() => false);

const game = {
  phase: "ready",
  current: platformIds[0],
  target: platformIds[1],
  platformQueue: [...platformIds],
  score: 0,
  chargeStartedAt: 0,
  chargePower: 0,
  jump: null,
  respawnStartedAt: 0,
};

const getStageRect = () => stage.getBoundingClientRect();
const getVisibleClawdHeight = () => clawdSize.height - clawdSize.bottomPadding;
const getClawdBodyCollisionHeight = () =>
  clawdSize.height - clawdSize.topPadding - clawdSize.bottomPadding;
const getJumpHangtimeLift = () => stageSize.height * JUMP_HANGTIME_LIFT_RATIO;
const getSpikeTipSurfaceY = () => stageSize.height - spikeHeight;
const getBottomSpikeTipSurfaceY = () => spikeHeight;
const getBottomDeathEmbedDepth = () =>
  clamp(
    spikeHeight * BOTTOM_DEATH_EMBED_DEPTH_RATIO,
    BOTTOM_DEATH_EMBED_DEPTH_MIN,
    BOTTOM_DEATH_EMBED_DEPTH_MAX,
  );
const getBottomSpikeHitSurfaceY = () =>
  getBottomSpikeTipSurfaceY() - getBottomDeathEmbedDepth();
const getClawdBodyTopY = (motion, bodyCollisionHeight) =>
  motion.surfaceY + bodyCollisionHeight * motion.scaleY;
const getJumpLift = (power) =>
  lerp(
    stageSize.height * CHARGE_MIN_LIFT_RATIO,
    stageSize.height * CHARGE_MAX_LIFT_RATIO,
    clamp01(power),
  );

const getChargePowerForLift = (lift) => {
  const minLift = stageSize.height * CHARGE_MIN_LIFT_RATIO;
  const maxLift = stageSize.height * CHARGE_MAX_LIFT_RATIO;
  const liftRange = maxLift - minLift;

  return liftRange > 0 ? (lift - minLift) / liftRange : 1;
};

const setArms = (leftArm, rightArm, degrees) => {
  leftArm.setAttribute(
    "transform",
    `rotate(${-degrees} ${ARM_PIVOTS.left.x} ${ARM_PIVOTS.left.y})`,
  );
  rightArm.setAttribute(
    "transform",
    `rotate(${degrees} ${ARM_PIVOTS.right.x} ${ARM_PIVOTS.right.y})`,
  );
};

const syncSmearTrailDirection = (trailDirectionY) => {
  const maskDirection = trailDirectionY === "up" ? "top" : "bottom";
  const maskImage = `linear-gradient(to ${maskDirection}, #000 0%, #000 34%, transparent 100%)`;

  clawdSmear.style.transformOrigin =
    trailDirectionY === "up" ? "center bottom" : "center top";
  clawdSmear.style.webkitMaskImage = maskImage;
  clawdSmear.style.maskImage = maskImage;
};

const syncMascotSize = () => {
  clawdSize.height = Math.round(
    clamp(
      Math.min(stageSize.width, stageSize.height) * CLAWD_HEIGHT_RATIO,
      MIN_CLAWD_HEIGHT,
      MAX_CLAWD_HEIGHT,
    ) * CLAWD_SCENE_SCALE,
  );
  clawdSize.width = clawdSize.height * CLAWD_ASPECT_RATIO;
  clawdSize.topPadding = Math.round(
    clawdSize.height * CLAWD_TOP_PADDING_RATIO,
  );
  clawdSize.bottomPadding = Math.round(
    clawdSize.height * CLAWD_BOTTOM_PADDING_RATIO,
  );

  [clawdBody, clawdSmear].forEach((element) => {
    element.style.width = `${clawdSize.width}px`;
    element.style.height = `${clawdSize.height}px`;
  });
};

const syncSpikes = () => {
  spikeHeight = Math.round(
    clamp(
      Math.min(stageSize.width, stageSize.height) * SPIKE_HEIGHT_RATIO,
      SPIKE_HEIGHT_MIN,
      SPIKE_HEIGHT_MAX,
    ),
  );

  const spikeWidth = Math.round(spikeHeight * SPIKE_WIDTH_TO_HEIGHT_RATIO);
  const strokeWidth = platformThickness;
  const baseY = strokeWidth / 2;
  const tipY = Math.max(baseY, spikeHeight - strokeWidth / 2);
  const triangleCount = Math.max(1, Math.round(stageSize.width / spikeWidth));
  const fittedSpikeWidth = stageSize.width / triangleCount;
  const path = Array.from({ length: triangleCount }, (_, index) => {
    const x = index * fittedSpikeWidth;
    return `M ${x} ${baseY} L ${x + fittedSpikeWidth} ${baseY} L ${
      x + fittedSpikeWidth / 2
    } ${tipY} Z`;
  }).join(" ");

  stage.style.setProperty("--spike-height", `${spikeHeight}px`);
  [
    { container: spikes, svg: spikesSvg, path: spikesPath },
    { container: bottomSpikes, svg: bottomSpikesSvg, path: bottomSpikesPath },
  ].forEach((spikeSet) => {
    spikeSet.container.style.setProperty("--platform", PLATFORM_COLOR);
    spikeSet.svg.setAttribute(
      "viewBox",
      `0 0 ${stageSize.width} ${spikeHeight}`,
    );
    spikeSet.svg.setAttribute("width", `${stageSize.width}`);
    spikeSet.svg.setAttribute("height", `${spikeHeight}`);
    spikeSet.path.setAttribute("d", path);
    spikeSet.path.setAttribute("stroke-width", `${strokeWidth}`);
  });
};

const getMinPlatformWidth = () =>
  Math.max(64, Math.round(stageSize.width * PLATFORM_WIDTH_MIN_RATIO));

const getMaxPlatformWidth = () =>
  Math.max(
    getMinPlatformWidth() + 1,
    Math.round(stageSize.width * PLATFORM_WIDTH_MAX_RATIO),
  );

const getPlatformWidth = (id) =>
  platformWidths[id] || Math.round(stageSize.width * 0.26);

const setPlatformWidth = (id, width) => {
  platformWidths[id] = Math.round(
    clamp(width, getMinPlatformWidth(), getMaxPlatformWidth()),
  );
};

const setRandomPlatformWidth = (id) => {
  setPlatformWidth(
    id,
    getRandomBetween(getMinPlatformWidth(), getMaxPlatformWidth()),
  );
};

const syncPlatformSizes = () => {
  platformThickness = Math.max(
    3,
    Math.round(Math.min(stageSize.width, stageSize.height) * 0.004),
  );
  platformVisualThickness = Math.max(
    PLATFORM_VISUAL_THICKNESS_MIN,
    Math.round(platformThickness * PLATFORM_VISUAL_THICKNESS_MULTIPLIER),
  );

  Object.entries(platforms).forEach(([id, platform]) => {
    platform.style.width = `${getPlatformWidth(id)}px`;
    platform.style.height = `${Math.max(28, platformVisualThickness)}px`;
    platform.style.setProperty(
      "--platform-thickness",
      `${platformVisualThickness}px`,
    );
    platform.style.setProperty("--platform", PLATFORM_COLOR);
  });

  syncSpikes();
};

const getPlatformSurfaceBounds = () => ({
  min: stageSize.height * PLATFORM_SURFACE_MIN_RATIO + platformVisualThickness,
  max: stageSize.height * PLATFORM_SURFACE_MAX_RATIO,
});

const getCurrentSurfaceY = () => {
  const bounds = getPlatformSurfaceBounds();
  return clamp(stageSize.height * CURRENT_SURFACE_RATIO, bounds.min, bounds.max);
};

const getScreenSurfaceY = (worldSurfaceY) =>
  worldSurfaceY - cameraSurfaceY + getCurrentSurfaceY();

const getPlatformBounds = (id) => ({
  minX: 0,
  maxX: Math.max(0, stageSize.width - getPlatformWidth(id)),
});

const clampPlatformPosition = (id) => {
  const bounds = getPlatformBounds(id);
  platformPositions[id].x = clamp(
    platformPositions[id].x,
    bounds.minX,
    bounds.maxX,
  );
};

const syncPlatform = (id) => {
  const position = platformPositions[id];
  const screenTop = Math.round(
    stageSize.height - getScreenSurfaceY(position.surfaceY),
  );

  platforms[id].style.transform = `translate3d(${position.x}px, ${screenTop}px, 0)`;
  platforms[id].style.opacity =
    platformGenerated[id] && screenTop >= spikeHeight ? "1" : "0";
};

const syncPlatforms = () => {
  platformIds.forEach((id) => {
    clampPlatformPosition(id);
    syncPlatform(id);
  });
};

const getPlatformScreenSurfaceY = (id) =>
  getScreenSurfaceY(platformPositions[id].surfaceY);

const isPlatformVisibleOnStage = (id) => {
  const screenTop = stageSize.height - getPlatformScreenSurfaceY(id);

  return (
    platformGenerated[id] &&
    getPlatformWidth(id) > 0 &&
    screenTop >= spikeHeight &&
    screenTop <= stageSize.height
  );
};

const sortPlatformIdsByScreenHeight = (ids) =>
  [...ids].sort(
    (a, b) => getPlatformScreenSurfaceY(a) - getPlatformScreenSurfaceY(b),
  );

const syncQueueToLowestVisiblePlatform = () => {
  const generatedIds = platformIds.filter(
    (id) => platformGenerated[id] && getPlatformWidth(id) > 0,
  );
  const visibleIds = sortPlatformIdsByScreenHeight(
    generatedIds.filter(isPlatformVisibleOnStage),
  );
  const visibleIdSet = new Set(visibleIds);
  const hiddenGeneratedIds = sortPlatformIdsByScreenHeight(
    generatedIds.filter((id) => !visibleIdSet.has(id)),
  );
  const queuedIds = [...visibleIds, ...hiddenGeneratedIds];

  if (queuedIds.length < 2) {
    game.platformQueue = [...platformIds];
    syncQueuedPlatforms();
    placeInitialPlatforms();
    return;
  }

  const queuedIdSet = new Set(queuedIds);
  game.platformQueue = [
    ...queuedIds,
    ...platformIds.filter((id) => !queuedIdSet.has(id)),
  ];
  syncQueuedPlatforms();
};

const rescaleJumpStateProps = ({ widthScale, heightScale }) => {
  if (!game.jump?.jumpStateProps) {
    return;
  }

  const props = game.jump.jumpStateProps;
  props.startX *= widthScale;
  props.endX *= widthScale;
  props.startY *= heightScale;
  props.endY *= heightScale;
  props.highAirY *= heightScale;
  props.hangtimeLift *= heightScale;
  props.landingImpactReferenceSpeed =
    clawdSize.height * LANDING_IMPACT_REFERENCE_SPEED_RATIO;
  props.visibleClawdHeight = getVisibleClawdHeight();
  props.bodyCollisionHeight = getClawdBodyCollisionHeight();
};

const rescaleStageLayout = (previousStageSize) => {
  if (!previousStageSize.width || !previousStageSize.height) {
    return;
  }

  const widthScale = stageSize.width / previousStageSize.width;
  const heightScale = stageSize.height / previousStageSize.height;

  platformIds.forEach((id) => {
    if (platformWidths[id]) {
      setPlatformWidth(id, platformWidths[id] * widthScale);
    }

    platformPositions[id].x = Math.round(platformPositions[id].x * widthScale);
    platformPositions[id].surfaceY = Math.round(
      platformPositions[id].surfaceY * heightScale,
    );
  });

  cameraSurfaceY *= heightScale;

  if (game.jump?.cameraMove) {
    game.jump.cameraMove.startCameraSurfaceY *= heightScale;
    game.jump.cameraMove.endCameraSurfaceY *= heightScale;
  }

  rescaleJumpStateProps({ widthScale, heightScale });
};

const resyncJumpCollisionFrame = () => {
  if (!game.jump?.jumpStateProps) {
    return;
  }

  if (game.jump.outcome === "top") {
    const topCollisionFrame = findTopCollisionFrame(game.jump.jumpStateProps);
    game.jump.freezeFrame = topCollisionFrame;
    game.jump.resolveFrame = topCollisionFrame + TOP_DEATH_DURATION_FRAMES;
    return;
  }

  if (game.jump.outcome === "low") {
    const bottomCollisionFrame = findBottomCollisionFrame(
      game.jump.jumpStateProps,
    );
    game.jump.freezeFrame = bottomCollisionFrame;
    game.jump.resolveFrame =
      bottomCollisionFrame + BOTTOM_DEATH_DURATION_FRAMES;
  }
};

const getPlatformAnchor = (id) => {
  const position = platformPositions[id];
  return {
    x: position.x + getPlatformWidth(id) / 2,
    surfaceY: getScreenSurfaceY(position.surfaceY),
  };
};

const getPlatformWorldAnchor = (id) => {
  const position = platformPositions[id];
  return {
    x: position.x + getPlatformWidth(id) / 2,
    surfaceY: position.surfaceY,
  };
};

const syncChargeMeterPosition = ({ anchor }) => {
  const meterWidth = Math.round(
    clamp(clawdSize.width * CHARGE_METER_WIDTH_RATIO, 8, 18),
  );
  const meterHeight = Math.round(
    clamp(
      getVisibleClawdHeight() * CHARGE_METER_HEIGHT_RATIO,
      48,
      Math.max(48, stageSize.height * 0.32),
    ),
  );
  const meterGap = Math.round(
    clamp(clawdSize.width * CHARGE_METER_GAP_RATIO, 8, 22),
  );
  const maxLeft = Math.max(
    CHARGE_METER_STAGE_PADDING,
    stageSize.width - meterWidth - CHARGE_METER_STAGE_PADDING,
  );
  const maxBottom = Math.max(
    CHARGE_METER_STAGE_PADDING,
    stageSize.height - meterHeight - CHARGE_METER_STAGE_PADDING,
  );
  const clawdLeft = anchor.x - clawdSize.width / 2;
  const visibleClawdHeight = getVisibleClawdHeight();
  const left = clamp(
    Math.round(clawdLeft - meterGap - meterWidth),
    CHARGE_METER_STAGE_PADDING,
    maxLeft,
  );
  const bottom = clamp(
    Math.round(anchor.surfaceY + (visibleClawdHeight - meterHeight) / 2),
    CHARGE_METER_STAGE_PADDING,
    maxBottom,
  );

  chargeMeter.style.width = `${meterWidth}px`;
  chargeMeter.style.height = `${meterHeight}px`;
  chargeMeter.style.left = `${left}px`;
  chargeMeter.style.bottom = `${bottom}px`;
};

const setPlatformCenterAndWorldSurface = ({ id, centerX, surfaceY }) => {
  platformPositions[id].x = Math.round(centerX - getPlatformWidth(id) / 2);
  platformPositions[id].surfaceY = Math.round(surfaceY);
  clampPlatformPosition(id);
  syncPlatform(id);
};

const syncQueuedPlatforms = () => {
  game.current = game.platformQueue[0];
  game.target = game.platformQueue[1];
};

const syncPlatformRoles = () => {
  Object.entries(platforms).forEach(([id, platform]) => {
    platform.classList.toggle("is-current", id === game.current);
    platform.classList.toggle("is-target", id === game.target);
  });
};

const getTargetDirections = ({ fromX, targetWidth, minDistance }) => {
  const minCenterX = targetWidth / 2;
  const maxCenterX = stageSize.width - targetWidth / 2;

  return [-1, 1].filter((direction) => {
    const available =
      direction < 0 ? fromX - minCenterX : maxCenterX - fromX;
    return available >= minDistance * 0.65;
  });
};

const generateNextPlatform = ({ id, fromId, preferredDirection = null }) => {
  const from = getPlatformWorldAnchor(fromId);
  setRandomPlatformWidth(id);
  syncPlatformSizes();
  platformGenerated[id] = true;

  const targetWidth = getPlatformWidth(id);
  const minCenterX = targetWidth / 2;
  const maxCenterX = stageSize.width - targetWidth / 2;
  const minDistance = stageSize.width * TARGET_HORIZONTAL_DISTANCE_MIN_RATIO;
  const maxDistance = stageSize.width * TARGET_HORIZONTAL_DISTANCE_MAX_RATIO;
  const directions = getTargetDirections({
    fromX: from.x,
    targetWidth,
    minDistance,
  });
  let direction =
    preferredDirection && directions.includes(preferredDirection)
      ? preferredDirection
      : pickRandom(directions.length ? directions : [-1, 1]);
  let availableDistance =
    direction < 0 ? from.x - minCenterX : maxCenterX - from.x;

  if (availableDistance < minDistance * 0.5) {
    direction *= -1;
    availableDistance =
      direction < 0 ? from.x - minCenterX : maxCenterX - from.x;
  }

  const safeMaxDistance = Math.max(1, Math.min(maxDistance, availableDistance));
  const safeMinDistance = Math.min(minDistance, safeMaxDistance * 0.72);
  const distance = getRandomBetween(safeMinDistance, safeMaxDistance);
  const minVerticalGap = stageSize.height * TARGET_VERTICAL_GAP_MIN_RATIO;
  const maxVerticalGap = Math.max(
    minVerticalGap + 1,
    stageSize.height * TARGET_VERTICAL_GAP_MAX_RATIO,
  );
  const surfaceY =
    from.surfaceY + getRandomBetween(minVerticalGap, maxVerticalGap);

  setPlatformCenterAndWorldSurface({
    id,
    centerX: clamp(from.x + direction * distance, minCenterX, maxCenterX),
    surfaceY,
  });
};

const placeInitialPlatforms = () => {
  cameraSurfaceY = 0;

  platformIds.forEach((id) => {
    platformWidths[id] = 0;
    platformGenerated[id] = false;
    platforms[id].style.opacity = "0";
  });

  setPlatformWidth(game.current, stageSize.width * 0.28);
  platformGenerated[game.current] = true;
  syncPlatformSizes();
  setPlatformCenterAndWorldSurface({
    id: game.current,
    centerX: stageSize.width * 0.5,
    surfaceY: cameraSurfaceY,
  });
  platforms[game.current].style.opacity = "1";

  game.platformQueue.slice(1).forEach((id, index) => {
    generateNextPlatform({
      id,
      fromId: game.platformQueue[index],
      preferredDirection: index === 0 ? 1 : null,
    });
  });
};

const createJumpStateProps = ({ start, end, highAirY }) => {
  const visibleClawdHeight = getVisibleClawdHeight();

  return {
    startX: start.x,
    startY: start.surfaceY,
    endX: end.x,
    endY: end.surfaceY,
    highAirY,
    hangtimeLift: getJumpHangtimeLift(),
    landingImpactReferenceSpeed:
      clawdSize.height * LANDING_IMPACT_REFERENCE_SPEED_RATIO,
    visibleClawdHeight,
    bodyCollisionHeight: getClawdBodyCollisionHeight(),
  };
};

const getChargePower = (now) => {
  const elapsed = Math.max(0, now - game.chargeStartedAt);

  return (elapsed % CHARGE_MAX_MS) / CHARGE_MAX_MS;
};

const getChargeFeedback = (power) => {
  if (!stageSize.height) {
    return "low";
  }

  const start = getPlatformAnchor(game.current);
  const target = getPlatformAnchor(game.target);
  const targetLift = target.surfaceY - start.surfaceY;
  const clearPower = getChargePowerForLift(targetLift);
  const topSurfaceY =
    getSpikeTipSurfaceY() -
    getJumpHangtimeLift() -
    getClawdBodyCollisionHeight();
  const topPower = getChargePowerForLift(topSurfaceY - start.surfaceY);
  const topDeathPower = clamp01(topPower);
  const hasTopDeath = topPower <= 1;

  if (hasTopDeath && power >= topDeathPower) {
    return "top";
  }

  const safeStartPower = clamp01(clearPower);

  if (power < safeStartPower) {
    return "low";
  }

  const safeEndPower = hasTopDeath ? topDeathPower : 1;
  const perfectEndPower = clamp(
    getChargePowerForLift(
      targetLift + stageSize.height * CHARGE_PERFECT_CLEARANCE_RATIO,
    ),
    safeStartPower,
    Math.max(safeStartPower, safeEndPower),
  );

  return power <= perfectEndPower ? "perfect" : "high";
};

const getChargeColor = (feedback) => {
  switch (feedback) {
    case "perfect":
      return CHARGE_COLOR_PERFECT;
    case "high":
      return CHARGE_COLOR_HIGH;
    case "top":
      return CHARGE_COLOR_TOP;
    case "low":
    default:
      return CHARGE_COLOR_LOW;
  }
};

const findTopCollisionFrame = (jumpStateProps) => {
  const spikeTipY = getSpikeTipSurfaceY();
  let previousFrame = 0;
  let previousTopY = null;

  for (let frame = 0; frame <= CYCLE_DURATION_FRAMES; frame += 0.25) {
    const motion = getClawdJumpState({
      ...jumpStateProps,
      frame,
      fps: BASELINE_ANIMATION_FPS,
    });
    const bodyTopY = getClawdBodyTopY(
      motion,
      jumpStateProps.bodyCollisionHeight,
    );

    if (bodyTopY >= spikeTipY) {
      if (previousTopY === null || bodyTopY === previousTopY) {
        return frame;
      }

      const hitProgress = clamp01(
        (spikeTipY - previousTopY) / (bodyTopY - previousTopY),
      );
      return lerp(previousFrame, frame, hitProgress);
    }

    previousFrame = frame;
    previousTopY = bodyTopY;
  }

  return CLAWD_JUMP_TIMING.landingFrame;
};

const findBottomCollisionFrame = (jumpStateProps) => {
  const spikeHitY = getBottomSpikeHitSurfaceY();
  let previousFrame = 0;
  let previousBottomY = null;

  for (let frame = 0; frame <= CYCLE_DURATION_FRAMES; frame += 0.25) {
    const motion = getClawdJumpState({
      ...jumpStateProps,
      frame,
      fps: BASELINE_ANIMATION_FPS,
    });
    const bodyBottomY = motion.surfaceY;

    if (bodyBottomY <= spikeHitY) {
      if (previousBottomY === null || bodyBottomY === previousBottomY) {
        return frame;
      }

      const hitProgress = clamp01(
        (spikeHitY - previousBottomY) / (bodyBottomY - previousBottomY),
      );
      return lerp(previousFrame, frame, hitProgress);
    }

    previousFrame = frame;
    previousBottomY = bodyBottomY;
  }

  return CYCLE_DURATION_FRAMES;
};

const createJump = ({ now, chargePower }) => {
  const start = getPlatformAnchor(game.current);
  const target = getPlatformAnchor(game.target);
  const targetWorld = getPlatformWorldAnchor(game.target);
  const highAirY = start.surfaceY + getJumpLift(chargePower);
  const clearsTarget = highAirY >= target.surfaceY;
  const hitsTop =
    highAirY + getJumpHangtimeLift() + getClawdBodyCollisionHeight() >=
    getSpikeTipSurfaceY();
  const outcome = hitsTop ? "top" : clearsTarget ? "success" : "low";
  const end = {
    x: target.x,
    surfaceY:
      outcome === "success" || outcome === "top"
        ? target.surfaceY
        : getBottomSpikeHitSurfaceY(),
  };
  const jumpStateProps = createJumpStateProps({
    start,
    end,
    highAirY,
  });
  const topCollisionFrame =
    outcome === "top" ? findTopCollisionFrame(jumpStateProps) : null;
  const bottomCollisionFrame =
    outcome === "low" ? findBottomCollisionFrame(jumpStateProps) : null;
  const freezeFrame = topCollisionFrame ?? bottomCollisionFrame;

  return {
    startedAt: now,
    startFrame: JUMP_RELEASE_START_FRAME,
    chargePower,
    outcome,
    cameraMove:
      outcome === "success"
        ? {
            startFrame: JUMP_CAMERA_START_FRAME,
            durationFrames: JUMP_CAMERA_DURATION_FRAMES,
            startCameraSurfaceY: cameraSurfaceY,
            endCameraSurfaceY: targetWorld.surfaceY,
          }
        : null,
    jumpStateProps,
    freezeFrame,
    resolveFrame:
      outcome === "top"
        ? topCollisionFrame + TOP_DEATH_DURATION_FRAMES
        : outcome === "low"
          ? bottomCollisionFrame + BOTTOM_DEATH_DURATION_FRAMES
        : CYCLE_DURATION_FRAMES,
  };
};

const setClawdHitState = (isHit) => {
  clawdBody.classList.toggle("is-hit", isHit);
};

const syncHud = () => {
  const chargeFeedback = getChargeFeedback(game.chargePower);

  scoreValue.textContent = String(game.score);
  chargeFill.style.transform = `translateY(${(1 - game.chargePower) * 100}%)`;
  chargeFill.style.setProperty(
    "--charge-color",
    getChargeColor(chargeFeedback),
  );
  chargeFill.classList.toggle("is-low", chargeFeedback === "low");
  stage.classList.toggle("is-dead", game.phase === "dead");
  stage.classList.toggle("is-charging", game.phase === "charging");
  stage.classList.toggle("is-jumping", game.phase === "jumping");
  stage.classList.toggle("is-respawning", game.phase === "respawning");
};

const renderStaticPose = ({ anchor, scaleX = 1, scaleY = 1, armSwing = 0 }) => {
  const clawdBottom = anchor.surfaceY - clawdSize.bottomPadding * scaleY;

  setClawdHitState(false);
  clawdBody.style.left = `${anchor.x}px`;
  clawdBody.style.bottom = `${clawdBottom}px`;
  clawdBody.style.transform = `translateX(-50%) scale(${scaleX}, ${scaleY})`;
  clawdVelocity.style.transform = "none";
  clawdSmear.style.opacity = "0";
  syncChargeMeterPosition({ anchor });
  setArms(bodyLeftArm, bodyRightArm, armSwing);
};

const renderReadyPose = () => {
  renderStaticPose({
    anchor: getPlatformAnchor(game.current),
  });
};

const finishRespawn = () => {
  if (game.phase !== "respawning") {
    return;
  }

  game.phase = "ready";
  game.respawnStartedAt = 0;
  syncHud();
  renderReadyPose();
};

const renderRespawnPose = (now) => {
  renderReadyPose();

  if (now - game.respawnStartedAt >= RESPAWN_FLASH_DURATION_MS) {
    finishRespawn();
  }
};

const renderChargingPose = (now) => {
  game.chargePower = getChargePower(now);
  const squash = easeOutQuart(game.chargePower);
  renderStaticPose({
    anchor: getPlatformAnchor(game.current),
    scaleX: lerp(1, ANTICIPATION_SCALE_X + 0.08, squash),
    scaleY: lerp(1, 0.56, squash),
    armSwing: lerp(0, ARM_TAKEOFF_DOWN_SWING_DEGREES, squash),
  });
  syncHud();
};

const BOTTOM_DEATH_TILT_START_FALL_PROGRESS = 2 / 5;

const getBottomDeathTiltDegrees = ({ frame, collisionFrame, jumpStateProps }) => {
  if (typeof collisionFrame !== "number") {
    return 0;
  }

  const fallStartFrame = getRenderFrameFromAnimationFrame({
    animationFrame: CLAWD_JUMP_TIMING.exitAccelerationStartFrame,
    fps: BASELINE_ANIMATION_FPS,
  });
  const tiltStartFrame = lerp(
    fallStartFrame,
    collisionFrame,
    BOTTOM_DEATH_TILT_START_FALL_PROGRESS,
  );
  const fallProgress = clamp01(
    (frame - tiltStartFrame) / Math.max(1, collisionFrame - tiltStartFrame),
  );
  const jumpDirection =
    Math.sign(jumpStateProps.endX - jumpStateProps.startX) || 1;

  return (
    BOTTOM_DEATH_FALL_TILT_DEGREES *
    jumpDirection *
    easeOutQuart(fallProgress)
  );
};

const renderJumpPose = (
  frame,
  jumpStateProps,
  { outcome = null, collisionFrame = null, cameraSurfaceOffset = 0 } = {},
) => {
  setClawdHitState(false);
  const bodyState = renderBodyLayer({
    frame,
    jumpStateProps,
    cameraSurfaceOffset,
    tiltDegrees:
      outcome === "low"
        ? getBottomDeathTiltDegrees({
            frame,
            collisionFrame,
            jumpStateProps,
          })
        : 0,
  });
  renderSmearLayer({
    ...bodyState,
    jumpStateProps,
  });
};

const renderTopDeathPose = ({ collisionFrame, deathFrame, jumpStateProps }) => {
  const collisionMotion = getClawdJumpState({
    ...jumpStateProps,
    frame: collisionFrame,
    fps: BASELINE_ANIMATION_FPS,
  });
  const collisionArmSwingDegrees = getClawdArmSwingDegrees({
    frame: collisionFrame,
    fps: BASELINE_ANIMATION_FPS,
    jumpStateProps,
    clawdMotion: collisionMotion,
  });
  const fallProgress = clamp01(
    (deathFrame - TOP_DEATH_IMPACT_HOLD_FRAMES) / TOP_DEATH_FALL_FRAMES,
  );
  const fallDistance =
    stageSize.height * TOP_DEATH_FALL_DISTANCE_RATIO * Math.pow(fallProgress, 2);
  const jumpDirection =
    Math.sign(jumpStateProps.endX - jumpStateProps.startX) || 1;
  const tiltDegrees = TOP_DEATH_FALL_TILT_DEGREES * jumpDirection * fallProgress;
  const scaleX = lerp(collisionMotion.scaleX, 0.94, fallProgress);
  const scaleY = lerp(collisionMotion.scaleY, 1.08, fallProgress);
  const surfaceY = collisionMotion.surfaceY - fallDistance;
  const clawdBottom = surfaceY - clawdSize.bottomPadding * scaleY;

  setClawdHitState(true);
  clawdBody.style.left = `${collisionMotion.centerX}px`;
  clawdBody.style.bottom = `${clawdBottom}px`;
  clawdBody.style.transform =
    `translateX(-50%) rotate(${tiltDegrees}deg) scale(${scaleX}, ${scaleY})`;
  clawdVelocity.style.transform = "none";
  clawdSmear.style.opacity = "0";
  setArms(
    bodyLeftArm,
    bodyRightArm,
    lerp(collisionArmSwingDegrees, ARM_MAX_UP_SWING_DEGREES, fallProgress),
  );
};

const renderBottomDeathPose = ({
  collisionFrame,
  jumpStateProps,
}) => {
  const collisionMotion = getClawdJumpState({
    ...jumpStateProps,
    frame: collisionFrame,
    fps: BASELINE_ANIMATION_FPS,
  });
  const collisionArmSwingDegrees = getClawdArmSwingDegrees({
    frame: collisionFrame,
    fps: BASELINE_ANIMATION_FPS,
    jumpStateProps,
    clawdMotion: collisionMotion,
  });
  const clawdBottom =
    collisionMotion.surfaceY -
    clawdSize.bottomPadding * collisionMotion.scaleY;
  const tiltDegrees = getBottomDeathTiltDegrees({
    frame: collisionFrame,
    collisionFrame,
    jumpStateProps,
  });

  setClawdHitState(true);
  clawdBody.style.left = `${collisionMotion.centerX}px`;
  clawdBody.style.bottom = `${clawdBottom}px`;
  clawdBody.style.transform = `translateX(-50%) rotate(${tiltDegrees}deg) scale(${collisionMotion.scaleX}, ${collisionMotion.scaleY})`;
  clawdVelocity.style.transform = "none";
  clawdSmear.style.opacity = "0";
  setArms(bodyLeftArm, bodyRightArm, collisionArmSwingDegrees);
};

const syncJumpCamera = ({ jump, frame }) => {
  const cameraMove = jump.cameraMove;

  if (!cameraMove) {
    return 0;
  }

  const progress = getJumpCameraProgress(
    (frame - cameraMove.startFrame) /
      Math.max(1, cameraMove.durationFrames),
  );
  cameraSurfaceY = lerp(
    cameraMove.startCameraSurfaceY,
    cameraMove.endCameraSurfaceY,
    progress,
  );
  syncPlatforms();

  return cameraSurfaceY - cameraMove.startCameraSurfaceY;
};

const finishJump = (now) => {
  if (game.phase !== "jumping" || !game.jump) {
    return;
  }

  if (game.jump.outcome === "success") {
    const recycledPlatform = game.current;
    const landedWorldSurfaceY =
      game.jump.cameraMove?.endCameraSurfaceY ??
      getPlatformWorldAnchor(game.target).surfaceY;

    game.score += 1;
    cameraSurfaceY = landedWorldSurfaceY;
    game.platformQueue = [...game.platformQueue.slice(1), recycledPlatform];
    syncQueuedPlatforms();
    platformGenerated[recycledPlatform] = false;
    platforms[recycledPlatform].style.opacity = "0";
    syncPlatforms();
    generateNextPlatform({
      id: recycledPlatform,
      fromId:
        game.platformQueue[game.platformQueue.length - 2] ?? game.current,
    });
    game.phase = "ready";
    game.chargePower = 0;
    game.jump = null;
    syncPlatformRoles();
    syncHud();
    renderReadyPose();
    return;
  }

  if (game.jump.outcome === "top" || game.jump.outcome === "low") {
    resetGame({ preservePlatforms: true, respawn: true, now });
    return;
  }

  game.phase = "dead";
  game.chargePower = 0;
  syncHud();
};

const renderBodyLayer = ({
  frame,
  jumpStateProps,
  tiltDegrees = 0,
  cameraSurfaceOffset = 0,
}) => {
  const clawdMotion = getClawdJumpState({
    ...jumpStateProps,
    frame,
    fps: BASELINE_ANIMATION_FPS,
  });
  const velocityStretch = getVelocityStretch({
    frame,
    fps: BASELINE_ANIMATION_FPS,
    jumpStateProps,
  });
  const armSwingDegrees = getClawdArmSwingDegrees({
    frame,
    fps: BASELINE_ANIMATION_FPS,
    jumpStateProps,
    clawdMotion,
  });
  const screenSurfaceY = clawdMotion.surfaceY - cameraSurfaceOffset;
  const clawdBottom =
    screenSurfaceY - clawdSize.bottomPadding * clawdMotion.scaleY;

  clawdBody.style.left = `${clawdMotion.centerX}px`;
  clawdBody.style.bottom = `${clawdBottom}px`;
  clawdBody.style.transform = `translateX(-50%) rotate(${tiltDegrees}deg) scale(${clawdMotion.scaleX}, ${clawdMotion.scaleY})`;
  clawdVelocity.style.transform = `rotate(${velocityStretch.angleDegrees}deg) scale(${velocityStretch.alongScale}, ${velocityStretch.acrossScale}) rotate(${-velocityStretch.angleDegrees}deg)`;
  setArms(bodyLeftArm, bodyRightArm, armSwingDegrees);

  return { clawdMotion, armSwingDegrees, clawdBottom, velocityStretch };
};

const renderSmearLayer = ({
  clawdMotion,
  armSwingDegrees,
  clawdBottom,
  jumpStateProps,
  velocityStretch,
}) => {
  const speedFactors = getTakeoffSmearSpeedFactors({
    speed: velocityStretch?.speed ?? 0,
    visibleClawdHeight: jumpStateProps.visibleClawdHeight,
  });
  const visibleIntensity =
    clawdMotion.takeoffSmearIntensity * speedFactors.visibleFactor;
  const shapeIntensity =
    clawdMotion.takeoffSmearIntensity * speedFactors.shapeFactor;
  const smearOpacity = TAKEOFF_SMEAR_MAX_OPACITY * visibleIntensity;

  if (visibleIntensity <= 0) {
    clawdSmear.style.opacity = "0";
    return;
  }

  const smearScaleX = lerp(1, 0.92, shapeIntensity);
  const smearScaleY =
    clawdMotion.scaleY + TAKEOFF_SMEAR_MAX_EXTRA_SCALE_Y * shapeIntensity;
  const trailDirectionY = getSmearTrailDirectionY(jumpStateProps);
  const smearSkewX = getSmearSkewDegrees({
    ...jumpStateProps,
    trailDirectionY,
    intensity: shapeIntensity,
  });

  syncSmearTrailDirection(trailDirectionY);
  clawdSmear.style.left = `${clawdMotion.centerX}px`;
  clawdSmear.style.bottom = `${clawdBottom}px`;
  clawdSmear.style.opacity = `${smearOpacity}`;
  clawdSmear.style.transform = `translateX(-50%) skewX(${smearSkewX}deg) scale(${smearScaleX}, ${smearScaleY})`;
  setArms(smearLeftArm, smearRightArm, armSwingDegrees);
};

const renderFrame = (now) => {
  if (!initialized) {
    return;
  }

  if (game.phase === "respawning") {
    renderRespawnPose(now);
    return;
  }

  if (game.phase === "charging") {
    renderChargingPose(now);
    return;
  }

  if (game.phase === "jumping" && game.jump) {
    const elapsedFrame =
      game.jump.startFrame +
      ((now - game.jump.startedAt) / 1000) * BASELINE_ANIMATION_FPS;

    if (
      game.jump.outcome === "top" &&
      game.jump.freezeFrame !== null &&
      elapsedFrame >= game.jump.freezeFrame
    ) {
      renderTopDeathPose({
        collisionFrame: game.jump.freezeFrame,
        deathFrame: elapsedFrame - game.jump.freezeFrame,
        jumpStateProps: game.jump.jumpStateProps,
      });

      if (elapsedFrame >= game.jump.resolveFrame) {
        finishJump(now);
      }
      return;
    }

    if (
      game.jump.outcome === "low" &&
      game.jump.freezeFrame !== null &&
      elapsedFrame >= game.jump.freezeFrame
    ) {
      renderBottomDeathPose({
        collisionFrame: game.jump.freezeFrame,
        jumpStateProps: game.jump.jumpStateProps,
      });

      if (elapsedFrame >= game.jump.resolveFrame) {
        finishJump(now);
      }
      return;
    }

    const frame = Math.min(elapsedFrame, CYCLE_DURATION_FRAMES);
    const cameraSurfaceOffset = syncJumpCamera({
      jump: game.jump,
      frame: elapsedFrame,
    });

    renderJumpPose(frame, game.jump.jumpStateProps, {
      outcome: game.jump.outcome,
      collisionFrame: game.jump.freezeFrame,
      cameraSurfaceOffset,
    });

    if (elapsedFrame >= game.jump.resolveFrame) {
      finishJump(now);
    }
    return;
  }

  if (game.phase === "dead" && game.jump) {
    const frame =
      game.jump.freezeFrame !== null
        ? game.jump.freezeFrame
        : CYCLE_DURATION_FRAMES;
    renderJumpPose(frame, game.jump.jumpStateProps);
    return;
  }

  renderReadyPose();
};

const tick = (now) => {
  renderFrame(now);
  frameRequest = requestAnimationFrame(tick);
};

const resetGame = ({
  preservePlatforms = false,
  respawn = false,
  now = performance.now(),
} = {}) => {
  game.phase = respawn ? "respawning" : "ready";
  if (preservePlatforms) {
    syncQueueToLowestVisiblePlatform();
  } else {
    game.platformQueue = [...platformIds];
    syncQueuedPlatforms();
  }
  game.score = 0;
  game.chargeStartedAt = 0;
  game.chargePower = 0;
  game.jump = null;
  game.respawnStartedAt = respawn ? now : 0;
  if (preservePlatforms) {
    syncPlatforms();
  } else {
    placeInitialPlatforms();
  }
  syncPlatformRoles();
  syncHud();
  renderReadyPose();
};

const updateStageSize = () => {
  const rect = getStageRect();
  const previousStageSize = stageSize;
  stageSize = {
    width: rect.width,
    height: rect.height,
  };

  if (!stageSize.width || !stageSize.height) {
    return;
  }

  syncMascotSize();
  if (!initialized) {
    initialized = true;
    resetGame();
    return;
  }

  rescaleStageLayout(previousStageSize);
  syncPlatformSizes();
  resyncJumpCollisionFrame();
  syncPlatforms();
  syncPlatformRoles();
  syncHud();
  renderFrame(performance.now());
};

const requestOverlayClose = () => {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(
    {
      source: "happy-clawd-game",
      type: "close-game",
    },
    "*",
  );
};

const isSpaceEvent = (event) => event.code === "Space" || event.key === " ";

const beginCharge = (now) => {
  if (!initialized || (game.phase !== "ready" && game.phase !== "dead")) {
    return;
  }

  if (game.phase === "dead") {
    resetGame({ preservePlatforms: true, now });
  }

  game.phase = "charging";
  game.chargeStartedAt = now;
  game.chargePower = 0;
  syncHud();
  renderChargingPose(now);
};

const releaseCharge = (now) => {
  if (game.phase !== "charging") {
    return;
  }

  game.chargePower = getChargePower(now);
  game.phase = "jumping";
  game.jump = createJump({
    now,
    chargePower: game.chargePower,
  });
  syncHud();
};

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    requestOverlayClose();
    return;
  }

  if (!isSpaceEvent(event) || event.repeat) {
    return;
  }

  event.preventDefault();
  beginCharge(performance.now());
});

window.addEventListener("keyup", (event) => {
  if (!isSpaceEvent(event)) {
    return;
  }

  event.preventDefault();
  releaseCharge(performance.now());
});

window.addEventListener("blur", () => {
  if (game.phase !== "charging") {
    return;
  }

  game.phase = "ready";
  game.chargePower = 0;
  syncHud();
});

const resizeObserver = new ResizeObserver(updateStageSize);
resizeObserver.observe(stage);

updateStageSize();
renderFrame(performance.now());
frameRequest = requestAnimationFrame(tick);

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(frameRequest);
});
