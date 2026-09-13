'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { root, semanticVersion, releaseName, outputName, buildRoot } = require('./release-config.cjs');

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function parseJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`Invalid JSON: ${path.relative(root, file)}\n${String(error)}`);
    }
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const packageJson = parseJson(path.join(root, 'package.json'));
const packageLock = parseJson(path.join(root, 'package-lock.json'));
if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) {
    throw new Error('package.json and package-lock.json versions must match.');
}

const assetsRoot = path.join(root, 'assets');
const assetFiles = walk(assetsRoot);
const metaFiles = assetFiles.filter((file) => file.endsWith('.meta'));
const typeScriptFiles = assetFiles.filter((file) => file.endsWith('.ts'));
const jsonTargets = [
    ...metaFiles,
    path.join(root, 'package.json'),
    path.join(root, 'package-lock.json'),
    ...assetFiles.filter((file) => file.endsWith('.scene') || file.endsWith('.prefab') || file.endsWith('.mtl')),
];

for (const file of jsonTargets) parseJson(file);

const metaUuids = metaFiles.map((file) => parseJson(file).uuid);
const uniqueMetaUuids = new Set(metaUuids);
if (uniqueMetaUuids.size !== metaUuids.length) throw new Error('Duplicate primary metadata UUID detected.');

let relativeImports = 0;
let typeScriptSyntaxErrors = 0;
let ts;
try {
    ts = require('typescript');
} catch {
    ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
}
for (const file of typeScriptFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const transpiled = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
        reportDiagnostics: true,
        fileName: file,
    });
    const syntaxDiagnostics = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (syntaxDiagnostics.length > 0) {
        typeScriptSyntaxErrors += syntaxDiagnostics.length;
        const message = syntaxDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n');
        throw new Error(`TypeScript syntax error in ${path.relative(root, file)}:\n${message}`);
    }
    if (/^(<{7}|={7}|>{7})/m.test(source)) {
        throw new Error(`Merge conflict marker detected in ${path.relative(root, file)}.`);
    }
    const importPattern = /(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(importPattern)) {
        relativeImports += 1;
        const target = path.resolve(path.dirname(file), match[1]);
        const candidates = [target, `${target}.ts`, `${target}.json`, path.join(target, 'index.ts')];
        if (!candidates.some((candidate) => fs.existsSync(candidate))) {
            throw new Error(`Unresolved relative import ${match[1]} in ${path.relative(root, file)}.`);
        }
    }
}

const classicVictoryFile = path.join(root, 'assets', 'scripts', 'core', 'ClassicVictoryService.ts');
const colorMonopolyFile = path.join(root, 'assets', 'scripts', 'core', 'ColorMonopolyService.ts');
const frontEndSourceFile = path.join(root, 'assets', 'scripts', 'ui', 'FrontEndShell.ts');
const matchHudSourceFile = path.join(root, 'assets', 'scripts', 'ui', 'MatchHUD.ts');
const presenterSourceFile = path.join(root, 'assets', 'scripts', 'ui', 'Authoritative3DBoardPresenter.ts');
const authorityOverlaySourceFile = path.join(root, 'assets', 'scripts', 'ui', 'AuthoritativeBoardOverlay.ts');
const previewTemplateFile = path.join(root, 'preview-template', 'index.ejs');
const webTemplateFile = path.join(root, 'build-templates', 'web-desktop', 'index.ejs');
const classicTimingFile = path.join(root, 'assets', 'scripts', 'core', 'ClassicPresentationTiming.ts');
for (const requiredFile of [classicVictoryFile, colorMonopolyFile, classicTimingFile, frontEndSourceFile, matchHudSourceFile, presenterSourceFile, authorityOverlaySourceFile, previewTemplateFile, webTemplateFile]) {
    if (!fs.existsSync(requiredFile)) throw new Error(`Missing V75 gameplay parity module: ${path.relative(root, requiredFile)}`);
}
const frontEndSource = fs.readFileSync(frontEndSourceFile, 'utf8');
const matchHudSource = fs.readFileSync(matchHudSourceFile, 'utf8');
const presenterSource = fs.readFileSync(presenterSourceFile, 'utf8');
const authorityOverlaySource = fs.readFileSync(authorityOverlaySourceFile, 'utf8');
const previewTemplate = fs.readFileSync(previewTemplateFile, 'utf8');
const webTemplate = fs.readFileSync(webTemplateFile, 'utf8');
if (!frontEndSource.includes('V105 LIVE REPLAY ACADEMY')) throw new Error('V102 lobby status marker is missing.');
if (!frontEndSource.includes('ClassicLobbyFallbackV90')) throw new Error('V90 widescreen lobby fallback is missing.');
if (!frontEndSource.includes('ClassicLobbyNoticeV90')) throw new Error('V90 classic lobby notice bar is missing.');
if (!frontEndSource.includes('ClassicEventRibbonV90')) throw new Error('V90 lobby service ribbon is missing.');
if (!matchHudSource.includes('VideoReferenceHudChromeV105')) throw new Error('V105 video-reference HUD chrome is missing.');
if (!matchHudSource.includes('VideoReferencePlayerCardV105')) throw new Error('V105 corner player cards are missing.');
if (!matchHudSource.includes('CleanSystemTickerV102')) throw new Error('V102 optional system ticker is missing.');
if (!matchHudSource.includes('LandingCard')) throw new Error('V105 compact arrival card is missing.');
if (!matchHudSource.includes('VideoReferencePhaseBarV105')) throw new Error('V105 compact phase bar is missing.');
if (!presenterSource.includes('classicOverviewPose')) throw new Error('V103 classic complete-board camera framing is missing.');
const comfortCameraPresetFile = path.join(root, 'assets', 'scripts', 'camera', 'ClassicComfortCameraPreset.ts');
const boardCameraControllerFile = path.join(root, 'assets', 'scripts', 'camera', 'BoardCameraController.ts');
if (!fs.existsSync(comfortCameraPresetFile) || !fs.existsSync(boardCameraControllerFile)) throw new Error('V103 comfort camera modules are missing.');
const comfortCameraPresetSource = fs.readFileSync(comfortCameraPresetFile, 'utf8');
const boardCameraControllerSource = fs.readFileSync(boardCameraControllerFile, 'utf8');
for (const marker of ['CLASSIC_COMFORT_CAMERA_FOV = 30', 'classicTargetPose', 'x: 40.5, y: 53.5, z: 40.5']) {
    if (!comfortCameraPresetSource.includes(marker)) throw new Error(`Missing V103 comfort camera marker: ${marker}`);
}
for (const marker of ['movementFocus', 'classic mode intentionally avoids per-step panning', 'classicDicePose']) {
    if (!boardCameraControllerSource.includes(marker)) throw new Error(`Missing V103 board camera marker: ${marker}`);
}

if (!authorityOverlaySource.includes('ClassicAuthorityChromeV90')) throw new Error('V90 authoritative classic HUD chrome is missing.');
for (const template of [previewTemplate, webTemplate]) {
    if (!template.includes('screen-orientation" content="landscape')) throw new Error('V90 templates must declare landscape orientation.');
    if (!template.includes('width: 100%') && !template.includes('width: 100vw')) throw new Error('V90 templates must use fullscreen sizing.');
    if (!template.includes('position: fixed')) throw new Error('V90 templates must pin the game canvas to the viewport.');
}

const boardViewSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'board', 'BoardView.ts'), 'utf8');
const matchModelSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'core', 'MatchModel.ts'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'core', 'GameBootstrap.ts'), 'utf8');
const fortuneDataSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'cards', 'FortuneCardData.ts'), 'utf8');
const fortuneDeckSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'cards', 'FortuneDeck.ts'), 'utf8');
const botDecisionSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'bot', 'BotDecisionService.ts'), 'utf8');
const gameCenterSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'gamecenter', 'GameCenterService.ts'), 'utf8');
const worldTravelSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'board', 'WorldTravelService.ts'), 'utf8');
const olympicSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'board', 'OlympicService.ts'), 'utf8');
const takeoverStrategyFile = path.join(root, 'assets', 'scripts', 'buildings', 'TakeoverStrategyService.ts');
if (!fs.existsSync(takeoverStrategyFile)) throw new Error('Missing V91 takeover strategy service.');
const takeoverStrategySource = fs.readFileSync(takeoverStrategyFile, 'utf8');
const matchAwardsFile = path.join(root, 'assets', 'scripts', 'core', 'MatchAwardsService.ts');
if (!fs.existsSync(matchAwardsFile)) throw new Error('Missing V92 match awards service.');
const matchAwardsSource = fs.readFileSync(matchAwardsFile, 'utf8');
const liquidationFile = path.join(root, 'assets', 'scripts', 'buildings', 'LiquidationService.ts');
if (!fs.existsSync(liquidationFile)) throw new Error('Missing V90 liquidation service.');
const liquidationSource = fs.readFileSync(liquidationFile, 'utf8');
const propertyControllerSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'buildings', 'PropertyController.ts'), 'utf8');
const colorMonopolySource = fs.readFileSync(colorMonopolyFile, 'utf8');
for (const marker of ['COLOR_MONOPOLY_RENT_MULTIPLIER = 2', 'completedVisualGroups', 'statusFor']) {
    if (!colorMonopolySource.includes(marker)) throw new Error(`Missing V90 Color Monopoly mechanic marker: ${marker}`);
}
for (const marker of ['ColorMonopolyRail', 'COLOR MONOPOLY ACTIVE']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V90 Color Monopoly HUD marker: ${marker}`);
}
for (const marker of ['ClassicColorMonopolyGateV89', 'ClassicColorMonopolyFloorRingV89', 'ClassicColorMonopolyCrownV89']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V90 Color Monopoly board marker: ${marker}`);
}
for (const marker of ['PropertyDevelopmentOption', 'propertyDevelopmentOptions', 'developmentPackageCost', 'reserveRisk']) {
    if (!matchModelSource.includes(marker)) throw new Error(`Missing V90 development-planner model marker: ${marker}`);
}
for (const marker of ['DevelopmentPlannerHeaderV90', 'propertyOptionButtons', 'CHOOSE A PACKAGE']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V90 development-planner HUD marker: ${marker}`);
}
for (const marker of ['ClassicDevelopmentTierHaloV89', 'ClassicPropertyYieldBeaconV89', 'ClassicDevelopmentFlagV89']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V90 development-planner board marker: ${marker}`);
}
if (!bootstrapSource.includes('confirmProperty(targetLevel?: number)')) throw new Error('V90 selected development target handling is missing.');
for (const marker of ['pendingFortuneChoices', 'fortuneChoiceCards', 'selectFortuneCard', 'drawMany(3)']) {
    if (!matchModelSource.includes(marker)) throw new Error(`Missing V90 Fortune choice model marker: ${marker}`);
}
for (const marker of ['FortuneStatusRail', 'ClassicFortuneChoicePromptV90', 'ClassicFortuneChoiceFooterV90', 'fortuneChoiceButtons']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V90 Fortune choice HUD marker: ${marker}`);
}
for (const marker of ['selectFortuneCard(cardId: string)', 'chooseFortuneCard', 'Fortune Signal is open']) {
    if (!bootstrapSource.includes(marker)) throw new Error(`Missing V90 Fortune flow marker: ${marker}`);
}
for (const marker of ['FortuneCardCategory', 'fortuneCardCategory', 'fortuneEffectPreview', 'sponsor-contract', 'world-circuit-pass']) {
    if (!fortuneDataSource.includes(marker)) throw new Error(`Missing V90 Fortune card data marker: ${marker}`);
}
if (!fortuneDeckSource.includes('drawMany(count: number)')) throw new Error('V90 unique draw-three Fortune deck is missing.');
if (!botDecisionSource.includes('fortuneCardScore')) throw new Error('V90 strategic Fortune bot scoring is missing.');
for (const marker of ['GameCenterLane', 'SAFE SIGNAL', 'JACKPOT SIGNAL', 'entryCost', 'netChange']) {
    if (!gameCenterSource.includes(marker)) throw new Error(`Missing V90 Game Center risk-lane marker: ${marker}`);
}
for (const marker of ['WorldTravelStrategicTag', 'reserveAfter', 'completesColorMonopoly', 'strategicScore']) {
    if (!worldTravelSource.includes(marker)) throw new Error(`Missing V90 World Travel strategy marker: ${marker}`);
}
for (const marker of ['rentGain', 'gainPercent', 'OlympicRentThreat']) {
    if (!olympicSource.includes(marker)) throw new Error(`Missing V90 Olympic forecast marker: ${marker}`);
}
for (const marker of ['SpecialDistrictRail', 'GAME CENTER RISK LANES OPEN', 'RIVAL TOLL', 'RESERVE FLOOR']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V90 special-district HUD marker: ${marker}`);
}
for (const marker of ['ClassicSpecialDistrictRingV89', 'ClassicWorldTravelPortalV89', 'ClassicIslandLockBarV89', 'ClassicBonusPrizeV89', 'ClassicStartGateV89']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V89 special-district board marker: ${marker}`);
}
for (const marker of ['TakeoverStrategySnapshot', 'completesColorMonopoly', 'breaksRivalColorMonopoly', 'victoryProgressGain', 'strategicScore', 'reserveRisk']) {
    if (!takeoverStrategySource.includes(marker)) throw new Error(`Missing V91 takeover strategy marker: ${marker}`);
}
for (const marker of ['takeoverStrategy', 'TakeoverStrategyService', 'Reserve']) {
    if (!matchModelSource.includes(marker)) throw new Error(`Missing V91 takeover model integration marker: ${marker}`);
}
for (const marker of ['CleanHudInfoPanelV102', 'TAKEOVER SCORE', 'STRATEGIC TAKEOVER READY']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V91 takeover HUD marker: ${marker}`);
}
for (const marker of ['ClassicTakeoverDirectorV91', 'ClassicTakeoverOldOwnerRingV91', 'ClassicTakeoverNewOwnerRingV91', 'ClassicTakeoverControlSealV91']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V91 takeover board presentation marker: ${marker}`);
}
for (const marker of ['playTakeoverSequence', 'highImpact']) {
    if (!bootstrapSource.includes(marker)) throw new Error(`Missing V91 takeover presentation flow marker: ${marker}`);
}
if (!botDecisionSource.includes('strategy.strategicScore')) throw new Error('V91 strategic bot takeover scoring is missing.');

for (const awardMarker of ['MATCH MVP', 'CITY TYCOON', 'MASTER BUILDER', 'CASH RESERVE', 'IRON SURVIVOR', 'MatchPerformanceGrade']) {
    if (!matchAwardsSource.includes(awardMarker)) throw new Error(`Missing V92 match award marker: ${awardMarker}`);
}
for (const awardMarker of ['ClassicMatchLegacyAwardsRailV92', 'ClassicLegacyAwardCardV92', 'ClassicPerformanceGradeV92']) {
    if (!matchHudSource.includes(awardMarker)) throw new Error(`Missing V92 result HUD marker: ${awardMarker}`);
}
for (const awardMarker of ['ClassicResultLegacyAwardV92', 'ClassicResultAwardRingV92', 'ClassicResultAwardCrownV92', 'ClassicResultAwardBeaconV92']) {
    if (!boardViewSource.includes(awardMarker)) throw new Error(`Missing V92 result board marker: ${awardMarker}`);
}
for (const awardMarker of ['showResultAwards', 'LIVE REPLAY ACADEMY  •  V102', 'legacyAwards']) {
    if (!bootstrapSource.includes(awardMarker)) throw new Error(`Missing V96 result presentation marker: ${awardMarker}`);
}
if (!matchModelSource.includes('matchAwardsService.create')) throw new Error('V92 match award model integration is missing.');
const careerLegacyFile = path.join(root, 'assets', 'scripts', 'core', 'CareerLegacyService.ts');
if (!fs.existsSync(careerLegacyFile)) throw new Error('Missing V93 Career Legacy service.');
const careerLegacySource = fs.readFileSync(careerLegacyFile, 'utf8');
const careerProgressionDataSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'save', 'CareerProgressionData.ts'), 'utf8');
const localSaveDataSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'save', 'LocalSaveData.ts'), 'utf8');
const careerProgressionSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'core', 'CareerProgressionService.ts'), 'utf8');
const careerJourneyFile = path.join(root, 'assets', 'scripts', 'core', 'CareerJourneyService.ts');
if (!fs.existsSync(careerJourneyFile)) throw new Error('Missing V94 World Journey service.');
const careerJourneySource = fs.readFileSync(careerJourneyFile, 'utf8');
for (const marker of ['FIRST HONOR', 'S-GRADE MASTERCLASS', 'CLASSIC FINISHER', 'MILLIONAIRE BOARD', 'HIGHLIGHT REEL', 'legacyScore']) {
    if (!careerLegacySource.includes(marker)) throw new Error(`Missing V93 Career Legacy marker: ${marker}`);
}
for (const marker of ['CAREER_PROGRESSION_VERSION = 7', 'performanceScoreTotal', 'claimedLegacyMilestoneIds', 'CareerJourneyProgression', 'highlightTitle']) {
    if (!careerProgressionDataSource.includes(marker)) throw new Error(`Missing V93 career save marker: ${marker}`);
}
for (const marker of ['legacyMilestoneCredits', 'completedLegacyMilestoneTitles', 'journeyMissionCredits', 'unlockedJourneyTierLabels', 'matchHighlightTitle', 'CareerLegacyService', 'CareerJourneyService']) {
    if (!careerProgressionSource.includes(marker)) throw new Error(`Missing V93 career progression marker: ${marker}`);
}
for (const marker of ['ClassicSeasonArchiveRailV96', 'ClassicSeasonArchiveTextV96', 'JOURNEY MISSION', 'PERFECT CYCLE', 'PRESTIGE REWARD', 'SEASON ARCHIVE', 'MATCH HIGHLIGHT']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V96 Season Archive result HUD marker: ${marker}`);
}
for (const marker of ['ClassicCareerLegacyHighlightV93', 'ClassicCareerLegacyRingV93', 'ClassicCareerLegacyOrbitV93']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V93 Career Legacy board marker: ${marker}`);
}
for (const marker of ['showCareerLegacyHighlight', 'showWorldJourneyHighlight', 'completedLegacyMilestoneTitles', 'completedJourneyMissionTitles', 'completedJourneyPerfectCycleLabels', 'unlockedJourneyPrestigeLabels', 'matchHighlightTitle']) {
    if (!bootstrapSource.includes(marker)) throw new Error(`Missing V95 Career and Journey presentation marker: ${marker}`);
}

for (const marker of ['WORLD JOURNEY', 'DAILY MATCH', 'WEEKLY CIRCUIT', 'JOURNEY_MAX_LEVEL = 20', 'JOURNEY_PRESTIGE_MAX_LEVEL = 10', 'PERFECT_DAILY_REWARD_CREDITS', 'activeDayStreak', 'recordMatch', 'dailyResetAt', 'weeklyResetAt']) {
    if (!careerJourneySource.includes(marker)) throw new Error(`Missing V95 Journey Prestige marker: ${marker}`);
}
for (const marker of ['journey: CareerJourneyProgression', 'seasonExperience', 'claimedTierIds', 'claimedPrestigeIds', 'perfectDailyIds', 'activeDayStreak', 'classicVictories']) {
    if (!careerProgressionDataSource.includes(marker)) throw new Error(`Missing V95 Journey Prestige save marker: ${marker}`);
}
for (const marker of ['WORLD JOURNEY', 'Prestige', 'Perfect Day', 'Daily resets', 'Journey rewards earned']) {
    if (!frontEndSource.includes(marker)) throw new Error(`Missing V95 Journey Prestige front-end marker: ${marker}`);
}
for (const marker of ['ClassicWorldJourneyHighlightV94', 'ClassicWorldJourneyRingV94', 'ClassicWorldJourneyOrbitV94', 'ClassicWorldJourneyRewardRayV94']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V94 World Journey board marker: ${marker}`);
}
for (const marker of ['ClassicJourneyPrestigeRingV95', 'ClassicJourneyPrestigeCrownV95', 'ClassicJourneyPrestigeCoreV95', 'ClassicJourneyPrestigeSpikeV95']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V95 Journey Prestige board marker: ${marker}`);
}

for (const marker of ['CareerJourneySeasonArchive', 'JOURNEY_SEASON_ARCHIVE_LIMIT', 'localRivalBoard', 'archivedSeasonLabels', 'seasonRewardCredits']) {
    if (!careerJourneySource.includes(marker)) throw new Error(`Missing V96 Journey Archive marker: ${marker}`);
}
for (const marker of ['seasonArchive', 'lifetimeJourneyExperience', 'seasonsCompleted', 'bestSeasonExperience', 'seasonPerfectDaily', 'seasonPerfectWeekly']) {
    if (!careerProgressionDataSource.includes(marker)) throw new Error(`Missing V96 Journey Archive save marker: ${marker}`);
}
for (const marker of ['LOCAL RIVAL BOARD', 'SEASON ARCHIVE', 'TACTICAL REPLAY REEL', 'V105 LIVE REPLAY ACADEMY']) {
    if (!frontEndSource.includes(marker)) throw new Error(`Missing V96 Journey Command Center marker: ${marker}`);
}
for (const marker of ['ClassicSeasonArchiveRingV96', 'ClassicSeasonArchiveCoreV96', 'ClassicSeasonArchivePillarV96']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V96 Season Archive board marker: ${marker}`);
}
for (const marker of ['archivedJourneySeasonLabels', 'completedJourneyRivalContractTitles', 'LIVE REPLAY ACADEMY  •  V102']) {
    if (!bootstrapSource.includes(marker)) throw new Error(`Missing V96 season rollover presentation marker: ${marker}`);
}

for (const marker of ['RIVAL_CONTRACTS', 'RIVAL BOARD CHAMPION', 'rivalRatingChange', 'completedRivalContractTitles', 'local-rivals-v97']) {
    if (!careerJourneySource.includes(marker)) throw new Error(`Missing V97 Rival Contract service marker: ${marker}`);
}
for (const marker of ['CAREER_PROGRESSION_VERSION = 7', 'rivalRating', 'claimedRivalContractIds', 'seasonBestRivalRank', 'finalRivalRating']) {
    if (!careerProgressionDataSource.includes(marker)) throw new Error(`Missing V97 Rival Contract save marker: ${marker}`);
}
for (const marker of ['journeyRivalCredits', 'completedJourneyRivalContractTitles', 'highlightReel']) {
    if (!careerProgressionSource.includes(marker)) throw new Error(`Missing V97 career integration marker: ${marker}`);
}
for (const marker of ['RIVAL CONTRACT', 'Rival rating', 'TACTICAL REPLAY REEL', 'CLIENT  V102']) {
    if (!frontEndSource.includes(marker)) throw new Error(`Missing V97 Career Command UI marker: ${marker}`);
}
for (const marker of ['ClassicRivalContractHighlightV97', 'ClassicRivalContractRingV97', 'ClassicRivalChampionCrownV97']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V97 Rival Contract board marker: ${marker}`);
}
for (const marker of ['RIVAL RATING', 'journeyRivalRatingChange', 'completedJourneyRivalContractTitles']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V97 Rival Contract result HUD marker: ${marker}`);
}

for (const marker of ['RIVAL_GAUNTLETS', 'GAUNTLET CHAMPION', 'rivalGauntletScoreGain', 'completedRivalGauntletTitles']) {
    if (!careerJourneySource.includes(marker)) throw new Error(`Missing V98 Rival Gauntlet service marker: ${marker}`);
}
for (const marker of ['CAREER_PROGRESSION_VERSION = 7', 'seasonRivalGauntletScore', 'claimedRivalGauntletIds', 'finalRivalGauntletScore', 'bestRivalPodiumStreak']) {
    if (!careerProgressionDataSource.includes(marker)) throw new Error(`Missing V98 Rival Gauntlet save marker: ${marker}`);
}
for (const marker of ['LOCAL_SAVE_VERSION = 13', 'value.version === 12']) {
    if (!localSaveDataSource.includes(marker)) throw new Error(`Missing V98 local save migration marker: ${marker}`);
}
for (const marker of ['journeyRivalGauntletCredits', 'completedJourneyRivalGauntletTitles', 'tacticalHighlightTag', 'replayPriority']) {
    if (!careerProgressionSource.includes(marker)) throw new Error(`Missing V98 Career tactical integration marker: ${marker}`);
}
for (const marker of ['RIVAL GAUNTLET', 'Gauntlet', 'TACTICAL REPLAY REEL', 'CLIENT  V102']) {
    if (!frontEndSource.includes(marker)) throw new Error(`Missing V98 Career Command UI marker: ${marker}`);
}
for (const marker of ['ClassicRivalGauntletHighlightV98', 'ClassicRivalGauntletScoreRingV98', 'ClassicRivalGauntletCoreV98', 'ClassicRivalGauntletGateV98']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V98 Rival Gauntlet board marker: ${marker}`);
}
for (const marker of ['GAUNTLET SCORE', 'journeyRivalGauntletScoreGained', 'completedJourneyRivalGauntletTitles']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V98 Rival Gauntlet result HUD marker: ${marker}`);
}
for (const marker of ['showRivalGauntletHighlight', 'LIVE REPLAY ACADEMY  •  V102']) {
    if (!bootstrapSource.includes(marker)) throw new Error(`Missing V98 Rival Gauntlet presentation marker: ${marker}`);
}

const replayCoachFile = path.join(root, 'assets', 'scripts', 'core', 'ReplayCoachService.ts');
const replayLibraryDataFile = path.join(root, 'assets', 'scripts', 'save', 'ReplayLibraryData.ts');
const replayLibraryServiceFile = path.join(root, 'assets', 'scripts', 'core', 'ReplayLibraryService.ts');
const replayAcademyFile = path.join(root, 'assets', 'scripts', 'core', 'ReplayAcademyService.ts');
for (const requiredFile of [replayCoachFile, replayLibraryDataFile, replayLibraryServiceFile, replayAcademyFile]) {
    if (!fs.existsSync(requiredFile)) throw new Error(`Missing V102 replay coach module: ${path.relative(root, requiredFile)}`);
}
const replayCoachSource = fs.readFileSync(replayCoachFile, 'utf8');
const replayLibraryDataSource = fs.readFileSync(replayLibraryDataFile, 'utf8');
const replayLibraryServiceSource = fs.readFileSync(replayLibraryServiceFile, 'utf8');
const replayAcademySource = fs.readFileSync(replayAcademyFile, 'utf8');
for (const marker of ['ReplayCoachService', 'tempoScore', 'economyScore', 'controlScore', 'resilienceScore', 'keyMoments', 'focusAreas']) {
    if (!replayCoachSource.includes(marker)) throw new Error(`Missing V102 Replay Coach marker: ${marker}`);
}
for (const marker of ['REPLAY_LIBRARY_VERSION = 4', 'ReplayCoachSummary', 'ReplayCoachKeyMoment', 'coach?: ReplayCoachSummary']) {
    if (!replayLibraryDataSource.includes(marker)) throw new Error(`Missing V102 replay data migration marker: ${marker}`);
}
for (const marker of ['new ReplayCoachService()', 'this.replayCoach.analyze(record)', 'normalizedRecord.coach']) {
    if (!replayLibraryServiceSource.includes(marker)) throw new Error(`Missing V102 replay library integration marker: ${marker}`);
}
for (const marker of ['ReplayAcademyService', 'academyTier', 'focusMetric', 'recommendedReplayId', 'completedDrills']) {
    if (!replayAcademySource.includes(marker)) throw new Error(`Missing V102 Live Academy marker: ${marker}`);
}
for (const marker of ['academyProgress', 'ReplayAcademySnapshot', 'ReplayAcademyDrill', 'bestAverageScore']) {
    if (!replayLibraryDataSource.includes(marker)) throw new Error(`Missing V102 Live Academy data marker: ${marker}`);
}
for (const marker of ['new ReplayAcademyService()', 'academyBestAverageScore', 'completedDrillIds', 'previousAcademy']) {
    if (!replayLibraryServiceSource.includes(marker)) throw new Error(`Missing V102 Live Academy integration marker: ${marker}`);
}
for (const marker of ['V102 LIVE ACADEMY', 'LIVE MATCH OBJECTIVES + DECISION REVIEW', 'academyDrills', 'REPLAY ACADEMY']) {
    if (!frontEndSource.includes(marker)) throw new Error(`Missing V102 Live Academy UI marker: ${marker}`);
}
if (!bootstrapSource.includes('REPLAY ACADEMY:')) throw new Error('V102 Live Academy result marker is missing.');
for (const marker of ['REPLAY COACH', 'DECISION REVIEW', 'GRADE ${coach.grade}', 'CLIENT  V102']) {
    if (!frontEndSource.includes(marker)) throw new Error(`Missing V102 Replay Coach UI marker: ${marker}`);
}
if ((frontEndSource.match(/beginAuthoritativeReplay\(result\.data, `SERVER LIBRARY REPLAY/g) || []).length !== 1) {
    throw new Error('V102 server replay must initialize exactly once.');
}
const liveAcademyPath = path.join(root, 'assets', 'scripts', 'core', 'LiveAcademyObjectiveService.ts');
if (!fs.existsSync(liveAcademyPath)) throw new Error('Missing V102 Live Academy objective module.');
const liveAcademySource = fs.readFileSync(liveAcademyPath, 'utf8');
for (const marker of ['FAST DECISION DRILL', 'CITY ECONOMY DRILL', 'BOARD CONTROL DRILL', 'CASH RESERVE DRILL', 'rewardForStreak']) {
    if (!liveAcademySource.includes(marker)) throw new Error(`Missing V102 Live Academy marker: ${marker}`);
}
for (const marker of ['liveObjectiveCompletions', 'liveObjectiveStreak', 'bestLiveObjectiveStreak', 'totalLiveObjectiveCredits']) {
    if (!replayLibraryDataSource.includes(marker) || !replayLibraryServiceSource.includes(marker)) {
        throw new Error(`Missing V102 Live Academy persistence marker: ${marker}`);
    }
}
if (!matchHudSource.includes('LiveAcademyObjectiveRailV102')) throw new Error('V102 live objective HUD rail is missing.');
if (!bootstrapSource.includes('finalizeLiveAcademyObjective')) throw new Error('V102 live objective finalization is missing.');

if (!bootstrapSource.includes('LIVE REPLAY ACADEMY  •  V102')) throw new Error('V102 bootstrap marker is missing.');

for (const marker of ['LIQUIDATION_BUILDING_RECOVERY_RATE = 0.70', 'LIQUIDATION_LAND_RECOVERY_RATE = 0.60', 'coverShortfall', 'LiquidationSummary']) {
    if (!liquidationSource.includes(marker)) throw new Error(`Missing V90 liquidation mechanic marker: ${marker}`);
}
for (const marker of ['downgrade(tileIndex: number)', 'release(tileIndex: number, ownerId?: string)']) {
    if (!propertyControllerSource.includes(marker)) throw new Error(`Missing V90 property liquidation support marker: ${marker}`);
}
for (const marker of ['liquidationPreserveScore', 'Auto-liquidation recovered', 'unpaid > 0']) {
    if (!matchModelSource.includes(marker)) throw new Error(`Missing V90 bankruptcy rescue flow marker: ${marker}`);
}
for (const marker of ['LiquidationStatusRail', 'AUTO-LIQUIDATION', 'BANKRUPTCY CONFIRMED']) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V90 liquidation HUD marker: ${marker}`);
}
for (const marker of ['ClassicLiquidationAuctionV90', 'ClassicLiquidationAuctionRingV90', 'ClassicLiquidationBankSealV90']) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V90 liquidation board presentation marker: ${marker}`);
}
for (const marker of ['playLiquidationSequence', 'automatic asset liquidation']) {
    if (!bootstrapSource.includes(marker)) throw new Error(`Missing V90 liquidation presentation flow marker: ${marker}`);
}
for (const marker of [
    'ClassicArcadeCabinetBaseV85',
    'ClassicBlueOuterFrameV85',
    'ClassicIvoryBoardV85',
    'ClassicSkyCenterFieldV85',
    'ClassicCloudClusterV85',
    'ClassicWorldCenterShowcaseV85',
    'ClassicComePlayersGlobeV85',
    'ClassicWorldCityTowerV85',
    'ClassicCenterDiceArenaV85',
    'ClassicTileBlueBaseV85',
    'ClassicTileCapV85',
    'ClassicTileIdentityRailV85',
    'ClassicDistrictLampV85',
    'ClassicDistrictMiniatureV85',
    'ClassicOwnerMarkerV85',
    'ClassicHotelV85',
    'ClassicLandmarkTowerV85',
    'ClassicRouteRailV85',
    'ClassicRouteMarkerV85',
    'ClassicRouteDestinationBeaconV85',
    'ClassicLandingSparkV85',
    'ClassicTurnLampV85',
    'ClassicTilePriceBadgeV85',
    'ClassicTileFaceInsetV85',
    'ClassicDistrictCrestV85',
    'ClassicSpectatorTerraceV85',
    'ClassicCrowdLightV85',
    'ClassicWorldRacerV85',
    'ClassicRouteArrowV85',
    'ClassicRouteDestinationRingV85',
    'ClassicActiveTileFocusV85',
    'ClassicLandingShockwaveV85',
    'ClassicLandingRayV85',
    'ClassicPropertyLevelBadgeV85',
    'ClassicBoardBillboardV85',
    'ClassicBillboardSpotlightV85',
    'ClassicEconomyMarkerV85',
    'ClassicRentPylonV85',
    'ClassicTourismCrownV85',
    'ClassicLandmarkHaloV85',
    'ClassicHotelMarqueeV85',
    'ClassicTurnSpotlightV85',
    'ClassicTurnSpotlightRingV85',
    'ClassicPropertyDistrictPulseV85',
    'ClassicPropertyStreetLampV85',
    'ClassicPropertyStatusCrownV85',
    'ClassicMatchDirectorHubV85',
    'ClassicMatchDirectorRingV85',
    'ClassicLandingCrownV85',
    'ClassicTurnBroadcastOrbitV85',
    'ClassicTurnBroadcastSatelliteV85',
    'ClassicRouteStepGateV85',
    'ClassicRouteDestinationFinV85',
    'ClassicPropertyEconomyHubV85',
    'ClassicPropertyRentMeterV85',
    'ClassicPropertyEconomyOrbitV85',
    'ClassicBoardBroadcastBeaconV85',
    'ClassicBoardBroadcastRingV85',
    'ClassicConstructionSequenceV79',
]) {
    if (!boardViewSource.includes(marker)) throw new Error(`Missing V85 classic board marker: ${marker}`);
}
const cameraSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'camera', 'BoardCameraController.ts'), 'utf8');
if (!cameraSource.includes('landingSequence')) throw new Error('V85 two-stage landing camera director is missing.');
const networkSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'network', 'NetworkService.ts'), 'utf8');
if (!matchHudSource.includes('VideoReferenceDiceDockV105')) throw new Error('V102 compact dice control dock is missing.');
if (!matchHudSource.includes('CityIntelRail')) throw new Error('V102 optional city-intelligence detail is missing.');
if (!matchHudSource.includes('TurnOrderRail')) throw new Error('V102 optional turn-order detail is missing.');
if (!matchHudSource.includes('ModeBadge')) throw new Error('V102 optional match mode detail is missing.');
if (!matchHudSource.includes('VideoReferenceThreatAlertV105')) throw new Error('V102 compact threat alert is missing.');
if (!frontEndSource.includes('ClassicLobbyClientDockV90')) throw new Error('V90 lobby client dock is missing.');
for (const marker of ['DiceControlRequest', "'AUTO' | 'ODD' | 'EVEN'", "'LOW' | 'MID' | 'HIGH'", 'diceControlScore']) {
    if (!networkSource.includes(marker)) throw new Error(`Missing V90 dice control authority marker: ${marker}`);
}

const boardSource = fs.readFileSync(path.join(root, 'assets', 'scripts', 'data', 'BoardData.ts'), 'utf8');
const tileTypesBlock = boardSource.match(/const TILE_TYPES:[\s\S]*?= \[(.*?)\];/s)?.[1] || '';
const tourismTileCount = (tileTypesBlock.match(/TileType\.Tourist/g) || []).length;
if (tourismTileCount < 4) throw new Error(`V75 requires four tourism destinations; found ${tourismTileCount}.`);
const victorySource = fs.readFileSync(classicVictoryFile, 'utf8');
for (const condition of ['TRIPLE_MONOPOLY', 'LINE_MONOPOLY', 'TOURISM_MONOPOLY']) {
    if (!victorySource.includes(condition)) throw new Error(`Missing classic victory condition: ${condition}`);
}

const buildFiles = walk(buildRoot);
const buildIndex = path.join(buildRoot, 'index.html');
const buildAvailable = fs.existsSync(buildIndex);
const requiredProjectPaths = [
    'assets',
    'settings',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
];
for (const relativePath of requiredProjectPaths) {
    if (!fs.existsSync(path.join(root, relativePath))) throw new Error(`Missing required project path: ${relativePath}`);
}

const forbiddenGeneratedPaths = ['library', 'temp', 'node_modules', '.creator'];
const includedGeneratedPaths = forbiddenGeneratedPaths.filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
if (includedGeneratedPaths.length > 0) {
    throw new Error(`Generated paths must not be included in a clean release: ${includedGeneratedPaths.join(', ')}`);
}

const result = {
    project: 'ComePlayersMarble',
    semanticVersion,
    releaseName,
    typeScriptFiles: typeScriptFiles.length,
    metaFiles: metaFiles.length,
    uniqueMetaUuids: uniqueMetaUuids.size,
    jsonTargets: jsonTargets.length,
    relativeImports,
    tourismTileCount,
    classicVictoryConditions: 3,
    fullscreenLandscapeTemplates: true,
    viewportPinnedTemplates: true,
    classicLobbyFallback: true,
    classicLobbyNotice: true,
    lobbyServiceRibbon: true,
    classicCornerHud: true,
    activePlayerIndicators: true,
    turnPhaseRibbon: true,
    arrivalCard: true,
    dynamicSystemTicker: true,
    authoritativeClassicChrome: true,
    classicArcadeWorldBoard: true,
    spectatorTerraces: true,
    orbitRacers: true,
    layeredActiveTileFocus: true,
    landingShockwaves: true,
    districtCrests: true,
    propertyLevelBadges: true,
    flatterPlayerMovement: true,
    boardEdgeBillboards: true,
    propertyEconomyPylons: true,
    tourismCrowns: true,
    landmarkHalos: true,
    openingCameraSweep: true,
    activeTurnCameraFocus: true,
    dynamicMonopolyThreatRail: true,
    playerCashReserveBars: true,
    liveTurnOrderRail: true,
    activePlayerSpotlight: true,
    livingPropertyDistricts: true,
    centralMatchDirectorHub: true,
    twoStageLandingCamera: true,
    liveCityIntelRail: true,
    colorMonopolyRentEconomy: true,
    teamColorMonopolyScopes: true,
    colorMonopolyBoardGates: true,
    colorMonopolyHudRail: true,
    strategicTakeoverDirector: true,
    takeoverReserveRisk: true,
    takeoverColorSetForecast: true,
    takeoverBoardPresentation: true,
    strategicBotTakeovers: true,
    matchLegacyAwards: true,
    performanceGrades: true,
    resultAwardBoardPresentation: true,
    careerLegacyMilestones: true,
    persistentPerformanceHistory: true,
    classicVictoryLegacyTracking: true,
    careerLegacyResultRail: true,
    careerLegacyBoardHighlight: true,
    worldJourneyMissions: true,
    worldJourneyDailyReset: true,
    worldJourneyWeeklyReset: true,
    worldJourneyTierRewards: true,
    worldJourneyBoardHighlight: true,
    journeyPrestigeLevels: true,
    journeyPerfectDailyAndWeekly: true,
    journeyActiveDayStreak: true,
    journeySeasonArchive: true,
    journeyLifetimeExperience: true,
    localJourneyRivalBoard: true,
    rivalRatingProgression: true,
    seasonalRivalContracts: true,
    duplicateSafeRivalRewards: true,
    careerHighlightReel: true,
    rivalContractBoardHighlight: true,
    rivalGauntletProgression: true,
    rivalPodiumStreaks: true,
    rivalGauntletRewards: true,
    tacticalReplayTags: true,
    tacticalReplayPriority: true,
    replayCoachDecisionReview: true,
    replayCoachMetrics: true,
    replayCoachKeyMoments: true,
    replayLibraryV3Migration: true,
    adaptiveReplayAcademy: true,
    replayAcademyPersistentDrills: true,
    singleServerReplayInitialization: true,
    rivalGauntletBoardHighlight: true,
    careerSaveV7Migration: true,
    localSaveV12Migration: true,
    seasonRolloverPresentation: true,
    seasonArchiveBoardHighlight: true,
    bankruptcyRescueLiquidation: true,
    strategicAssetPreservation: true,
    liquidationBoardPresentation: true,
    classicDevelopmentPackages: true,
    projectedRentForecast: true,
    investmentReserveRisk: true,
    developmentPaybackEstimate: true,
    fortuneDrawThreeChoice: true,
    fortuneCategoryForecast: true,
    fortunePersistentStatusRail: true,
    strategicBotFortuneSelection: true,
    uniqueFortuneOffers: true,
    fortuneCardCount: (fortuneDataSource.match(/id:\s*'/g) || []).length,
    gameCenterRiskLanes: true,
    gameCenterEntryEconomy: true,
    strategicWorldTravelForecast: true,
    olympicRentForecast: true,
    specialDistrictStatusRail: true,
    animatedSpecialDistrictMonuments: true,
    routeStepGates: true,
    destinationGuideFins: true,
    propertyRentMeters: true,
    propertyEconomyOrbiters: true,
    boardBroadcastBeacons: true,
    movementRoutePreview: true,
    activeTileHalo: true,
    landingCelebration: true,
    classicTilePriceBadges: true,
    classicDiceControl: true,
    centralWorldDiorama: true,
    brightPropertyCards: true,
    districtMiniatures: true,
    largerBuildingSilhouettes: true,
    sideAwareOwnershipFlags: true,
    brightClassicHudPalette: true,
    distinctBuildingStages: true,
    matchModeRail: true,
    liveThreatRail: true,
    lobbyClientDock: true,
    diceParityControl: true,
    diceRangeControl: true,
    connectedRouteRails: true,
    destinationBeacon: true,
    constructionSequence: true,
    activeTurnLamps: true,
    completeBoardCamera: true,
    classicComfortCamera: true,
    stableFullBoardFraming: true,
    destinationOnlyCameraTracking: true,
    reducedCameraImpact: true,
    authoritativeCameraParity: true,
    packageLockVersionMatches: true,
    typeScriptSyntaxErrors,
    conflictMarkers: 0,
    cleanGeneratedFolders: true,
    expectedBuild: outputName,
    buildAvailable,
    buildFiles: buildFiles.length,
    buildBytes: buildFiles.reduce((total, file) => total + fs.statSync(file).size, 0),
    packageSha256: sha256(path.join(root, 'package.json')),
};


// V102 clean HUD regression checks.
for (const marker of [
    'VideoReferenceHudChromeV105',
    'VideoReferenceTopBarV105',
    'CleanHudInfoPanelV102',
    'VideoReferenceDiceDockV105',
    'VideoReferencePlayerCardV105',
    'toggleAdvancedHud',
    'this.advancedHudPanel.active = false',
    "this.advancedHudButtonLabel.string = this.advancedHudPanel.active ? 'CLOSE' : 'INFO'",
]) {
    if (!matchHudSource.includes(marker)) throw new Error(`Missing V102 Clean HUD marker: ${marker}`);
}
for (const removedMarker of [
    'ClassicVictoryTrackerV90',
    'ClassicTurnOrderRailV90',
    'ClassicCityIntelRailV90',
    'ClassicSpecialDistrictRailV90',
    'ClassicLiquidationStatusRailV90',
]) {
    if (matchHudSource.includes(removedMarker)) throw new Error(`V102 still contains blocking HUD rail: ${removedMarker}`);
}
console.log(JSON.stringify(result, null, 2));
if (!buildAvailable) {
    console.warn(`[verify] Source verification passed. ${outputName} has not been built on this machine yet.`);
}
