const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  // Start the server with local provider
  process.env.THEWALL_PROVIDER = 'local';
  process.env.THEWALL_LOCAL_FOLDER = './samples';
  process.env.THEWALL_IMAGE_INTERVAL = '30';

  serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('TheWall behavior matches appendix sequence', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => window.theWall);
  await page.bringToFront();

  // Helper to get current image filename from src
  const getCurrentImageFilename = async () => {
    const src = await page.locator('#current-image').getAttribute('src');
    return src.split('/').pop();
  };

  // Helper to check offline status
  const isOffline = async () => {
    return await page.locator('#offline-indicator').isVisible();
  };

  // Expected filenames based on samples folder (sorted alphabetically), limited to 30 as per server
  const expectedFilenames = [
    '00-4k-458510-colosseum.jpg',
    '01-4k-458532-bellagio.jpg',
    '02-4k-463798-manhattan-skyscraper.jpg',
    '03-4k-468739-earth.jpg',
    '04-4k-468973-fireworks-night.jpg',
    '05-4k-549919-suns.jpg',
    '06-4k-555666-road-snow.jpg',
    '07-4k-614315-pirates-of-the-caribbean.jpg',
    '08-4k-685192-astronaut-parallel-universe.jpg',
    '09-4k-739662-beach.jpg',
    '10-4k-914670-ghost-in-the-shell.jpg',
    '11-4k-assassins-Assigncard_IV_video_game_ship_river_hd_sunrise_ultrahd_4k_wallpaper.jpg',
    '12-4k-assassins-skull_and_bones_2019_videogame_E3_ubisoft.jpg',
    '13-4k-ASSASSINS_CREED_action_fantasy_fighting_assassin_warrior_stealth_adventure_history.jpg',
    '14-4k-Assassins_Creed_Warriors_Men_Pirates_Games_warrior_weapon_sword_weapons_pirates_pirate.jpg',
    '15-4k-BOEING_777x_airliner_aircraft_airplane_jet_transport_777.jpg',
    '16-4k-bridges-golden_gate_bridge_at_night_4k_8k.jpg',
    '17-4k-bridges-julian-klumpers-golden-gate-unsplash.jpg',
    '18-4k-bridges-maarten-van-den-heuvel-golden-gate-unsplash.jpg',
    '19-4k-bridges-umer-sayyam-golden-gate-unsplash.jpg',
    '20-4k-bridges_golden_gate.jpg',
    '21-4k-cities-architecture_asia_attraction_bay_bridge_buildings_city_cityscape_downtown_evening_harbor_harbour_illuminated_landmark_lights_marina_metropolis_night_outdoors_river_riverside_singapore_skyline.jpg',
    '22-4k-cities-architecture_bridge_buildings_city_city_lights_cityscape_dawn_downtown_dusk_evening_harbor_highway_landmark_night_outdoors_reflection_river_sea_sky_skyline_sunset_travel_vehicle_water.jpg',
    '23-4k-cities-city_night_light_beautiful_sea_sky_amazing_stars.jpg',
    '24-4k-cities-pang-yuhao-8z0UI6IDCHY-unsplash.jpg',
    '25-4k-cities-pang-yuhao-efJTdhsmzPI-unsplash.jpg',
    '26-4k-desert_dark_4k_uhd_by_relhom-da7tf5z.jpg',
    '27-4k-earth_4k-HD.jpg',
    '28-4k-falcon-9-rocket-spacex-cape-canaveral-4k-6186.jpg',
    '29-4k-Ferrari_LaFerrari_HRE_Wheels_landscape_road_mountains_cars_supercars_red_fart_motors_speed_snow.jpg',
    '30-4k-frozen_tundra_4k_uhd_by_relhom-dab2zeh.jpg',
    '31-4k-INTERSTELLAR_sci_fi_adventure_mystery_astronaut_space_futurictic_spaceship.jpg',
    '32-4k-milkyway-astrology-astronomy-colors-2745254.jpg',
    '33-4k-milkyway-caleb-white-PLfzwAmflos-unsplash.jpg',
    '34-4k-roads-3840x2238-mountains-sunset.jpg',
    '35-4k-roads-aurora-borealis-northern-lights-road-winter-4k-16650.jpg',
    '36-4k-roads-beautiful_sunset_5k-wide.jpg',
    '37-4k-roads-Jasper_Alberta_Canada_Canadian_Rockies_mountain_road_forest_trees.jpg',
    '38-4k-roads-luke-stackpoole-x2qSNIEZuEE-unsplash.jpg',
    '39-4k-roads_field_horizon_mountains_clouds_sky.jpg',
    '40-4k-roads_forest_trees_landscape.jpg',
    '41-4k-sci_fi_star_wars_wars_spaceship_spacecraft_3d_cg_digital_art.jpg',
    '42-4k-space_battleship_yamato_anime_sci_fi_science_fiction_futuristic_spaceship_ship_boat_anime_d.jpg',
    '43-4k-STAR_TREK_futuristic_action_adventure_sci_fi_space_thriller_mystery_spaceship.jpg',
    '44-4k-STAR_WARS_sci_fi_action_fighting_futuristic_series_adventure_disney.jpg',
    '45-4k-Sunset_over_Cinderella_castle.jpg',
    '46-4k-USA_California_Yosemite_landscapes_clouds_nature_mountains_forest_snow_winter_waterfall_fog_sky.jpg'
  ];

  // Page Load
  await expect(page.locator('#current-image')).toBeVisible();
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[0]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 1
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[1]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 2
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[2]);
  expect(await isOffline()).toBe(false);

  // OFFLINE -> 2, true
  await page.keyboard.press('O');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[2]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 3
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[3]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 4
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[4]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 0 (cycle)
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[0]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 1
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[1]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 2
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[2]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 3
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[3]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 4
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[4]);
  expect(await isOffline()).toBe(true);

  // OFFLINE -> 4, false
  await page.keyboard.press('O');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[4]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 5
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[5]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 6
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[6]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 7
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[7]);
  expect(await isOffline()).toBe(false);

  // Continue to image 32 as per table
  for (let i = 8; i <= 32; i++) {
    await page.keyboard.press('N');
    expect(await getCurrentImageFilename()).toBe(expectedFilenames[i]);
    expect(await isOffline()).toBe(false);
  }

  // At this point, should have expanded metadata to 0..59, but since we have only 47 images, it will cycle or something
  // But for the test, we've checked the sequence up to 32
});

test('TheWall behavior with server restart', async ({ page }) => {
  // Start a new server on port 3001
  const serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: './samples', THEWALL_IMAGE_INTERVAL: '30', PORT: '3001' }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  await page.goto('http://localhost:3001');
  await page.waitForFunction(() => window.theWall);
  await page.bringToFront();

  // Helper to get current image filename from src
  const getCurrentImageFilename = async () => {
    const src = await page.locator('#current-image').getAttribute('src');
    return src.split('/').pop();
  };

  // Helper to check offline status
  const isOffline = async () => {
    return await page.locator('#offline-indicator').isVisible();
  };

  // Expected filenames (same as before)
  const expectedFilenames = [
    '00-4k-458510-colosseum.jpg',
    '01-4k-458532-bellagio.jpg',
    '02-4k-463798-manhattan-skyscraper.jpg',
    '03-4k-468739-earth.jpg',
    '04-4k-468973-fireworks-night.jpg',
    '05-4k-549919-suns.jpg',
    '06-4k-555666-road-snow.jpg',
    '07-4k-614315-pirates-of-the-caribbean.jpg',
    '08-4k-685192-astronaut-parallel-universe.jpg',
    '09-4k-739662-beach.jpg',
    '10-4k-914670-ghost-in-the-shell.jpg',
    '11-4k-assassins-Assigncard_IV_video_game_ship_river_hd_sunrise_ultrahd_4k_wallpaper.jpg',
    '12-4k-assassins-skull_and_bones_2019_videogame_E3_ubisoft.jpg',
    '13-4k-ASSASSINS_CREED_action_fantasy_fighting_assassin_warrior_stealth_adventure_history.jpg',
    '14-4k-Assassins_Creed_Warriors_Men_Pirates_Games_warrior_weapon_sword_weapons_pirates_pirate.jpg',
    '15-4k-BOEING_777x_airliner_aircraft_airplane_jet_transport_777.jpg',
    '16-4k-bridges-golden_gate_bridge_at_night_4k_8k.jpg',
    '17-4k-bridges-julian-klumpers-golden-gate-unsplash.jpg',
    '18-4k-bridges-maarten-van-den-heuvel-golden-gate-unsplash.jpg',
    '19-4k-bridges-umer-sayyam-golden-gate-unsplash.jpg',
    '20-4k-bridges_golden_gate.jpg',
    '21-4k-cities-architecture_asia_attraction_bay_bridge_buildings_city_cityscape_downtown_evening_harbor_harbour_illuminated_landmark_lights_marina_metropolis_night_outdoors_river_riverside_singapore_skyline.jpg',
    '22-4k-cities-architecture_bridge_buildings_city_city_lights_cityscape_dawn_downtown_dusk_evening_harbor_highway_landmark_night_outdoors_reflection_river_sea_sky_skyline_sunset_travel_vehicle_water.jpg',
    '23-4k-cities-city_night_light_beautiful_sea_sky_amazing_stars.jpg',
    '24-4k-cities-pang-yuhao-8z0UI6IDCHY-unsplash.jpg',
    '25-4k-cities-pang-yuhao-efJTdhsmzPI-unsplash.jpg',
    '26-4k-desert_dark_4k_uhd_by_relhom-da7tf5z.jpg',
    '27-4k-earth_4k-HD.jpg',
    '28-4k-falcon-9-rocket-spacex-cape-canaveral-4k-6186.jpg',
    '29-4k-Ferrari_LaFerrari_HRE_Wheels_landscape_road_mountains_cars_supercars_red_fart_motors_speed_snow.jpg',
    '30-4k-frozen_tundra_4k_uhd_by_relhom-dab2zeh.jpg',
    '31-4k-INTERSTELLAR_sci_fi_adventure_mystery_astronaut_space_futurictic_spaceship.jpg',
    '32-4k-milkyway-astrology-astronomy-colors-2745254.jpg',
    '33-4k-milkyway-caleb-white-PLfzwAmflos-unsplash.jpg',
    '34-4k-roads-3840x2238-mountains-sunset.jpg',
    '35-4k-roads-aurora-borealis-northern-lights-road-winter-4k-16650.jpg',
    '36-4k-roads-beautiful_sunset_5k-wide.jpg',
    '37-4k-roads-Jasper_Alberta_Canada_Canadian_Rockies_mountain_road_forest_trees.jpg',
    '38-4k-roads-luke-stackpoole-x2qSNIEZuEE-unsplash.jpg',
    '39-4k-roads_field_horizon_mountains_clouds_sky.jpg',
    '40-4k-roads_forest_trees_landscape.jpg',
    '41-4k-sci_fi_star_wars_wars_spaceship_spacecraft_3d_cg_digital_art.jpg',
    '42-4k-space_battleship_yamato_anime_sci_fi_science_fiction_futuristic_spaceship_ship_boat_anime_d.jpg',
    '43-4k-STAR_TREK_futuristic_action_adventure_sci_fi_space_thriller_mystery_spaceship.jpg',
    '44-4k-STAR_WARS_sci_fi_action_fighting_futuristic_series_adventure_disney.jpg',
    '45-4k-Sunset_over_Cinderella_castle.jpg',
    '46-4k-USA_California_Yosemite_landscapes_clouds_nature_mountains_forest_snow_winter_waterfall_fog_sky.jpg'
  ];

  // Page Load
  await expect(page.locator('#current-image')).toBeVisible();
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[0]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 1
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[1]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 2
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[2]);
  expect(await isOffline()).toBe(false);

  // Kill server to simulate offline
  serverProcess.kill();
  await page.waitForTimeout(1000);

  // NEXT -> 3 (should go offline)
  await page.keyboard.press('N');
  // Wait for offline detection
  await page.waitForFunction(() => !document.querySelector('#offline-indicator').classList.contains('hidden'), { timeout: 10000 });
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[3]);
  expect(await isOffline()).toBe(true);

  // NEXT -> 4
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[4]);
  expect(await isOffline()).toBe(true);

  // Restart server
  const restartedServerProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: './samples', THEWALL_IMAGE_INTERVAL: '30', PORT: '3001' }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // NEXT -> 5 (should go back online)
  await page.keyboard.press('N');
  // Wait for image to load and potentially go online
  await page.waitForTimeout(2000);
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[5]);
  expect(await isOffline()).toBe(false);

  // NEXT -> 6
  await page.keyboard.press('N');
  expect(await getCurrentImageFilename()).toBe(expectedFilenames[6]);
  expect(await isOffline()).toBe(false);

  // Kill the restarted server
  restartedServerProcess.kill();
});