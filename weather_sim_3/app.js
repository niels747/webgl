var canvas;
var gl;

const degToRad = 0.0174533;

const saveFileVersionID = 3460715085; // randomly generated id to check if save file is compatible

var saveFileName = "";

var sim_res_x;
var sim_res_y;

var frameNum = 0;
var lastFrameNum = 0;
var IterPerFrame = 10;
var maxIterFound = false;
var calcCount = 0;

var viewXpos = 0.0;
var viewYpos = 0.0;
var viewZoom = 1.0001;

var NUM_DROPLETS; //const NUM_DROPLETS = 30 * 1000;
const NUM_DROPLETS_DEVIDER = 40;

function download(filename, data) {
	var url = URL.createObjectURL(data);
	const element = document.createElement("a");
	element.setAttribute("href", url);
	element.setAttribute("download", filename);
	element.style.display = "none";
	document.body.appendChild(element);
	element.click();
	document.body.removeChild(element);
}

// Universal Functions

function map_range(value, low1, high1, low2, high2) {
	return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1);
}

function max(num1, num2) {
	if (num1 > num2) return num1;
	else return num2;
}

function min(num1, num2) {
	if (num1 < num2) return num1;
	else return num2;
}

// Temperature Functions

function CtoK(c) {
	return c + 273.15;
}

function KtoC(k) {
	return k - 273.15;
}

function dT_saturated(dTdry, dTl) {
	// dTl = temperature difference because of latent heat
	if (dTl == 0.0) return dTdry;
	else {
		var multiplier = dTdry / (dTdry - dTl);
		return dTdry * multiplier;
	}
}

////////////// Water Functions ///////////////
const wf_devider = 250.0;
const wf_pow = 17.0;

function maxWater(Td) {
	return Math.pow(Td / wf_devider, wf_pow); // w = ((Td)/(250))^(18) // Td in Kelvin, w in grams per m^3
}

function dewpoint(W) {
	if (W < 0.00001) return 0.0;
	else return wf_devider * Math.pow(W, 1.0 / wf_pow);
}

function relativeHumd(T, W) {
	return (W / maxWater(T)) * 100.0;
}

async function loadData() {
	let file = document.getElementById("fileInput").files[0];

	if (file) {
		let versionBlob = file.slice(0, 4);
		let versionBuf = await versionBlob.arrayBuffer();
		let version = new Uint32Array(versionBuf)[0];

		if (version == saveFileVersionID) {
			// only proceed if file has the right version id
			let fileArrBuf = await file.slice(4).arrayBuffer(); // slice from behind version to end of file
			let fileUint8Arr = new Uint8Array(fileArrBuf);
			let decompressed = window.pako.inflate(fileUint8Arr);
			let dataBlob = new Blob([decompressed]);

			let resBlob = dataBlob.slice(0, 4);
			let resBuf = await resBlob.arrayBuffer();
			resArray = new Uint16Array(resBuf);
			sim_res_x = resArray[0];
			sim_res_y = resArray[1];

			NUM_DROPLETS = (sim_res_x * sim_res_y) / NUM_DROPLETS_DEVIDER;

			saveFileName = file.name;

			if (saveFileName.includes(".")) {
				saveFileName = saveFileName.split(".").slice(0, -1).join("."); // remove extension
			}

			console.log("loading file: " + saveFileName);
			console.log("File versionID: " + version);
			console.log("sim_res_x: " + sim_res_x);
			console.log("sim_res_y: " + sim_res_y);

			let baseTexSize = sim_res_x * sim_res_y * 4 * 4; // in bytes
			let baseTexBlob = dataBlob.slice(4, 4 + baseTexSize);
			let baseTexBuf = await baseTexBlob.arrayBuffer();
			let baseTexF32 = new Float32Array(baseTexBuf);

			let waterTexSize = sim_res_x * sim_res_y * 4 * 4; // in bytes
			let waterTexBlob = dataBlob.slice(4 + baseTexSize, 4 + baseTexSize + waterTexSize);
			let waterTexBuf = await waterTexBlob.arrayBuffer();
			let waterTexF32 = new Float32Array(waterTexBuf);

			let wallTexSize = sim_res_x * sim_res_y * 2 * 1; // in bytes
			let wallTexBlob = dataBlob.slice(4 + baseTexSize + waterTexSize, 4 + baseTexSize + waterTexSize + wallTexSize);
			let wallTexBuf = await wallTexBlob.arrayBuffer();
			let wallTexI8 = new Int8Array(wallTexBuf);

			//var precipArraySize = NUM_DROPLETS * Float32Array.BYTES_PER_ELEMENT * 5; // in bytes
			let precipArrayBlob = dataBlob.slice(4 + baseTexSize + waterTexSize + wallTexSize); // from this to end of file
			let precipArrayBuf = await precipArrayBlob.arrayBuffer();
			let precipArray = new Float32Array(precipArrayBuf);

			//	console.log(wallTexI8);
			mainScript(baseTexF32, waterTexF32, wallTexI8, precipArray);
		} else {
			// wrong id
			alert("Incompatible file!");
		}
	} else {
		// no file, so create new simulation
		sim_res_x = parseInt(document.getElementById("simResSelX").value);
		sim_res_y = parseInt(document.getElementById("simResSelY").value);
		NUM_DROPLETS = (sim_res_x * sim_res_y) / NUM_DROPLETS_DEVIDER;
		mainScript(null);
	}
}

var mainScript = function (initialBaseTex, initialWaterTex, initialWallTex, initialRainDrops) {
	canvas = document.getElementById("mainCanvas");

	var contextAttributes = {
		alpha: false,
		desynchronized: false,
		antialias: false,
		depth: false,
		failIfMajorPerformanceCaveat: false,
		powerPreference: "high-performance",
		premultipliedAlpha: true,
		preserveDrawingBuffer: false,
		stencil: false
	};
	gl = canvas.getContext("webgl2", contextAttributes);
	//console.log(gl.getContextAttributes());

	if (!gl) {
		alert("Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera");
		throw " Error: Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera";
	}

	// SETUP GUI

	var guiControls = {
		vorticity: 0.005,
		dragMultiplier: 0.01, // 0.1
		wind: -0.0001,
		sunIntensity: 1.5, // 0.0005
		waterTemperature: 25,
		landEvaporation: 0.00005,
		waterEvaporation: 0.0001,
		evapHeat: 1.9, // 1.9
		meltingHeat: 0.6, // 0.281
		waterWeight: 0.5, // 0.50
		inactiveDroplets: 0,
		displayMode: "DISP_REAL",
		sunAngle: 0.1,
		timeOfDay: 9.9,
		dayNightCycle: true,
		IR_rate: 1.0,
		smooth: false,
		tool: "TOOL_WATER",
		brushSize: 50,
		wholeWidth: false,
		intensity: 0.01,
		showGraph: false,
		showAllDrops: false,
		paused: false,
		download: function () {
			prepareDownload();
		},
		dryLapseRate: 10.0, // 9.81 degrees / km
		simHeight: 12000 // meters
	};

	var datGui = new dat.GUI();

	var fluidParams_folder = datGui.addFolder("Fluid Parameters ");

	fluidParams_folder
		.add(guiControls, "vorticity", 0.0, 0.015)
		.onChange(function () {
			gl.useProgram(boundaryProgram);
			gl.uniform1f(gl.getUniformLocation(boundaryProgram, "vorticity"), guiControls.vorticity);
		})
		.name("Vorticity");

	fluidParams_folder
		.add(guiControls, "dragMultiplier", 0.0, 1.0)
		.onChange(function () {
			gl.useProgram(velocityProgram);
			gl.uniform1f(gl.getUniformLocation(velocityProgram, "dragMultiplier"), guiControls.dragMultiplier);
		})
		.name("Drag");

	fluidParams_folder
		.add(guiControls, "wind", -1.0, 1.0)
		.onChange(function () {
			gl.useProgram(velocityProgram);
			gl.uniform1f(gl.getUniformLocation(velocityProgram, "wind"), guiControls.wind);
		})
		.name("Wind");

	var UI_folder = datGui.addFolder("User Interaction");

	//datGui.add(guiControls, "smooth").name("Smooth");
	UI_folder.add(guiControls, "tool", { Temperature: "TOOL_TEMPERATURE", "Water Vapor / Cloud": "TOOL_WATER", Smoke: "TOOL_SMOKE", Land: "TOOL_WALL_LAND", "Lake / Sea": "TOOL_WALL_SEA", Fire: "TOOL_WALL_FIRE" }).name("Tool");
	UI_folder.add(guiControls, "brushSize", 1, 200).name("Brush Diameter").listen();
	UI_folder.add(guiControls, "wholeWidth").name("Whole Width Brush");
	UI_folder.add(guiControls, "intensity", 0.005, 0.05).name("Brush Intensity");

	var radiation_folder = datGui.addFolder("Radiation");

	// radiation_folder
	// 	.add(guiControls, "sunAngle", -85.0, 85.0)
	// 	// .onChange(function () {
	// 	// 	updateSunlight();
	// 	// })
	// 	.name("Sun Angle")
	// 	.listen();

	radiation_folder
		.add(guiControls, "timeOfDay", 0.0, 240.0)
		.onChange(function () {
			updateSunlight();
		})
		.name("Time of day")
		.listen();

	radiation_folder.add(guiControls, "dayNightCycle").name("Day/Night Cycle");

	radiation_folder
		.add(guiControls, "sunIntensity", 0.0, 2.0)
		.onChange(function () {
			updateSunlight();
		})
		.name("Sun Intensity");

	radiation_folder
		.add(guiControls, "IR_rate", 0.0, 10.0)
		.onChange(function () {
			gl.useProgram(boundaryProgram);
			gl.uniform1f(gl.getUniformLocation(boundaryProgram, "IR_rate"), guiControls.IR_rate);
		})
		.name("IR Multiplier");

	var water_folder = datGui.addFolder("Water Parameters");

	water_folder
		.add(guiControls, "waterTemperature", 0.0, 35.0)
		.onChange(function () {
			gl.useProgram(boundaryProgram);
			gl.uniform1f(gl.getUniformLocation(boundaryProgram, "waterTemperature"), CtoK(guiControls.waterTemperature));
			gl.useProgram(lightingProgram);
			gl.uniform1f(gl.getUniformLocation(lightingProgram, "waterTemperature"), CtoK(guiControls.waterTemperature));
		})
		.name("Lake / Sea Temperature");
	water_folder
		.add(guiControls, "landEvaporation", 0.0, 0.0002)
		.onChange(function () {
			gl.useProgram(boundaryProgram);
			gl.uniform1f(gl.getUniformLocation(boundaryProgram, "landEvaporation"), guiControls.landEvaporation);
		})
		.name("Land Evaporation");
	water_folder
		.add(guiControls, "waterEvaporation", 0.0, 0.0004)
		.onChange(function () {
			gl.useProgram(boundaryProgram);
			gl.uniform1f(gl.getUniformLocation(boundaryProgram, "waterEvaporation"), guiControls.waterEvaporation);
		})
		.name("Water Evaporation");
	water_folder
		.add(guiControls, "evapHeat", 0.0, 5.0)
		.onChange(function () {
			gl.useProgram(advectionProgram);
			gl.uniform1f(gl.getUniformLocation(advectionProgram, "evapHeat"), guiControls.evapHeat);
			gl.useProgram(precipitationProgram);
			gl.uniform1f(gl.getUniformLocation(precipitationProgram, "evapHeat"), guiControls.evapHeat);
		})
		.name("Evaporation Heat");
	water_folder
		.add(guiControls, "meltingHeat", 0.0, 5.0)
		.onChange(function () {
			gl.useProgram(advectionProgram);
			gl.uniform1f(gl.getUniformLocation(advectionProgram, "meltingHeat"), guiControls.meltingHeat);
			gl.useProgram(precipitationProgram);
			gl.uniform1f(gl.getUniformLocation(precipitationProgram, "meltingHeat"), guiControls.meltingHeat);
		})
		.name("Melting Heat");
	water_folder
		.add(guiControls, "waterWeight", 0.0, 2.0)
		.onChange(function () {
			gl.useProgram(boundaryProgram);
			gl.uniform1f(gl.getUniformLocation(boundaryProgram, "waterWeight"), guiControls.waterWeight);
			gl.useProgram(precipitationProgram);
			gl.uniform1f(gl.getUniformLocation(precipitationProgram, "waterWeight"), guiControls.waterWeight);
		})
		.name("Water Weight");

	datGui
		.add(guiControls, "displayMode", {
			"1 Temperature -26°C to 30°C": "DISP_TEMPERATURE",
			"2 Water Vapor": "DISP_WATER",
			"3 Realistic": "DISP_REAL",
			"4 Horizontal Velocity": "DISP_HORIVEL",
			"5 Vertical Velocity": "DISP_VERTVEL",
			"6 IR Heating / Cooling": "DISP_IRHEATING",
			"7 IR Down -60°C to 26°C": "DISP_IRDOWNTEMP",
			"8 IR Up -26°C to 30°C": "DISP_IRUPTEMP"
		})
		.name("Display Mode")
		.listen();
	datGui.add(guiControls, "inactiveDroplets", 0, NUM_DROPLETS).listen().name("Inactive Droplets");
	datGui.add(guiControls, "showAllDrops").name("Show all Droplets").listen();
	datGui.add(guiControls, "showGraph").onChange(hideOrShowGraph).name("Show Sounding Graph").listen();

	datGui.add(guiControls, "paused").name("Paused").listen();
	datGui.add(guiControls, "download").name("Save Simulation to File");

	datGui.width = 350;

	// END OF GUI

	var soundingGraph = {
		graphCanvas: null,
		ctx: null,
		init: function () {
			this.graphCanvas = document.getElementById("graphCanvas");
			this.graphCanvas.height = window.innerHeight;
			this.graphCanvas.width = this.graphCanvas.height * 0.8;
			this.ctx = this.graphCanvas.getContext("2d");
			var style = this.graphCanvas.style;
			if (guiControls.showGraph) style.display = "block";
			else style.display = "none";
		},
		draw: function (simXpos, simYpos) {
			// mouse positions in sim coordinates

			gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
			gl.readBuffer(gl.COLOR_ATTACHMENT0);
			var baseTextureValues = new Float32Array(4 * sim_res_y);
			gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA, gl.FLOAT, baseTextureValues); // read a vertical culumn of cells

			gl.readBuffer(gl.COLOR_ATTACHMENT1);
			var waterTextureValues = new Float32Array(4 * sim_res_y);
			gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues); // read a vertical culumn of cells

			const graphBottem = this.graphCanvas.height - 30; // in pixels

			var c = this.ctx;

			c.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
			c.fillStyle = "#00000055";
			c.fillRect(0, 0, graphCanvas.width, graphCanvas.height);

			drawIsotherms();

			var reachedAir = false;
			var surfaceLevel;

			// Draw temperature line
			c.beginPath();
			for (var y = 0; y < sim_res_y; y++) {
				var potentialTemp = baseTextureValues[4 * y + 3];

				var temp = potentialTemp - ((y / sim_res_y) * guiControls.simHeight * guiControls.dryLapseRate) / 1000.0 - 273.15;

				var scrYpos = map_range(y, sim_res_y, 0, 0, graphBottem);

				c.font = "15px Arial";
				c.fillStyle = "white";

				if (temp < 599.0) {
					// not wall
					if (!reachedAir) {
						// first non wall cell
						reachedAir = true;
						surfaceLevel = y;

						if (simYpos < surfaceLevel) simYpos = surfaceLevel;
					}
					if (reachedAir && y == simYpos) {
						//c.fillText("" + Math.round(map_range(y-1, 0, sim_res_y, 0, guiControls.simHeight)) + " m", 5, scrYpos + 5);
						c.strokeStyle = "#FFF";
						c.lineWidth = 1.0;
						c.strokeRect(T_to_Xpos(temp, scrYpos), scrYpos, 10, 1); // vertical position indicator
						c.fillText("" + temp.toFixed(1) + "°C", T_to_Xpos(temp, scrYpos) + 20, scrYpos + 5);
					}

					c.lineTo(T_to_Xpos(temp, scrYpos), scrYpos); // temperature
				}
			}
			c.lineWidth = 2.0; //3
			c.strokeStyle = "#FF0000";
			c.stroke();

			// Draw Dew point line
			c.beginPath();
			for (var y = surfaceLevel; y < sim_res_y; y++) {
				var dewPoint = dewpoint(waterTextureValues[4 * y]) - 273.15;

				var scrYpos = map_range(y, sim_res_y, 0, 0, graphBottem);

				c.font = "15px Arial";
				c.fillStyle = "white";

				//c.fillText("Surface: " + y, 10, scrYpos);
				if (y == simYpos) {
					c.fillText("" + Math.round(map_range(y - 1, 0, sim_res_y, 0, guiControls.simHeight)) + " m", 5, scrYpos + 5);
					c.strokeStyle = "#FFF";
					c.lineWidth = 1.0;
					c.strokeRect(T_to_Xpos(dewPoint, scrYpos) - 10, scrYpos, 10, 1); // vertical position indicator
					c.fillText("" + dewPoint.toFixed(1) + "°C", T_to_Xpos(dewPoint, scrYpos) - 70, scrYpos + 5);
				}
				c.lineTo(T_to_Xpos(dewPoint, scrYpos), scrYpos); // temperature
			}

			c.lineWidth = 2.0; //3
			c.strokeStyle = "#0055FF";
			c.stroke();

			// Draw rising parcel temperature line

			var water = waterTextureValues[4 * simYpos];
			var potentialTemp = baseTextureValues[4 * simYpos + 3];
			var initialTemperature = potentialTemp - ((simYpos / sim_res_y) * guiControls.simHeight * guiControls.dryLapseRate) / 1000.0;
			var initialCloudWater = waterTextureValues[4 * simYpos + 1];
			//var temp = potentialTemp - ((y / sim_res_y) * guiControls.simHeight * guiControls.dryLapseRate) / 1000.0 - 273.15;
			var prevTemp = initialTemperature;
			var prevCloudWater = initialCloudWater;

			var drylapsePerCell = ((-1.0 / sim_res_y) * guiControls.simHeight * guiControls.dryLapseRate) / 1000.0;

			reachedSaturation = false;

			c.beginPath();
			var scrYpos = map_range(simYpos, sim_res_y, 0, 0, graphBottem);
			c.moveTo(T_to_Xpos(KtoC(initialTemperature), scrYpos), scrYpos);
			for (var y = simYpos + 1; y < sim_res_y; y++) {
				var dT = drylapsePerCell;

				var cloudWater = max(water - maxWater(prevTemp + dT), 0.0); // how much cloud water there would be after that temperature change

				var dWt = (cloudWater - prevCloudWater) * guiControls.evapHeat; // how much that water phase change would change the temperature

				var actualTempChange = dT_saturated(dT, dWt);

				var T = prevTemp + actualTempChange;

				var scrYpos = map_range(y, sim_res_y, 0, 0, graphBottem);

				c.lineTo(T_to_Xpos(KtoC(T), scrYpos), scrYpos); // temperature

				prevTemp = T;
				prevCloudWater = max(water - maxWater(prevTemp), 0.0);

				if (!reachedSaturation && prevCloudWater > 0.0) {
					reachedSaturation = true;
					c.strokeStyle = "#008800"; // dark green for dry lapse rate
					c.stroke();

					if (y - simYpos > 5) {
						c.beginPath();
						c.moveTo(T_to_Xpos(KtoC(T), scrYpos) - 0, scrYpos); // temperature
						c.lineTo(T_to_Xpos(KtoC(T), scrYpos) + 40, scrYpos); // Horizontal ceiling line
						c.strokeStyle = "#FFFFFF";
						c.stroke();
						c.fillText("" + Math.round(map_range(y - 1, 0, sim_res_y, 0, guiControls.simHeight)) + " m", T_to_Xpos(KtoC(T), scrYpos) + 50, scrYpos + 5);
					}

					c.beginPath();
					c.moveTo(T_to_Xpos(KtoC(T), scrYpos), scrYpos); // temperature
				}
			}

			c.lineWidth = 2.0; // 3
			if (reachedSaturation) {
				c.strokeStyle = "#00FF00"; // light green for saturated lapse rate
			} else c.strokeStyle = "#008800";

			c.stroke();

			function T_to_Xpos(T, y) {
				// temperature to horizontal position

				var normX = T * 0.013 + 1.34 - (y / graphBottem) * 0.9;

				return normX * this.graphCanvas.width; // T * 7.5 + 780.0 - 600.0 * (y / graphBottem);
			}

			function drawIsotherms() {
				c.strokeStyle = "#964B00";
				c.beginPath();
				c.fillStyle = "white";

				for (var T = -80.0; T <= 40.0; T += 10.0) {
					c.moveTo(T_to_Xpos(T, graphBottem), graphBottem);
					c.lineTo(T_to_Xpos(T, 0), 0);

					if (T >= -30.0) c.fillText(Math.round(T) + "°C", T_to_Xpos(T, graphBottem) - 20, this.graphCanvas.height - 5);
				}
				c.lineWidth = 1.0;
				c.stroke();
				// draw 0 degree line thicker
				c.beginPath();
				c.moveTo(T_to_Xpos(0, graphBottem), graphBottem);
				c.lineTo(T_to_Xpos(0, 0), 0);
				c.lineWidth = 3.0;
				c.stroke();
			}
		} // end of draw()
	};
	soundingGraph.init();

	// END OF GRAPH

	const sim_aspect = sim_res_x / sim_res_y;

	var canvas_aspect;
	{
		var element = document.getElementById("IntroScreen");
		element.parentNode.removeChild(element); // remove introscreen div

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		canvas_aspect = canvas.width / canvas.height;

		window.addEventListener("resize", function () {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			canvas_aspect = canvas.width / canvas.height;

			soundingGraph.graphCanvas.height = window.innerHeight;
		});
	}

	var middleMousePressed = false;
	var leftMousePressed = false;
	var prevMouseX = 0;
	var prevMouseY = 0;
	var mouseX = 0;
	var mouseY = 0;
	var ctrlPressed = false;
	var bPressed = false;

	// EVENT LISTENERS

	window.addEventListener("wheel", function (event) {
		var delta = 0.1;
		if (event.deltaY > 0) delta *= -1;
		if (typeof lastWheel == "undefined") lastWheel = 0; // init static variable
		const now = new Date().getTime();

		if (bPressed) {
			guiControls.brushSize *= 1.0 + delta * 1.0;
			if (guiControls.brushSize < 1) guiControls.brushSize = 1;
			else if (guiControls.brushSize > 200) guiControls.brushSize = 200;
		} else {
			if (now - lastWheel > 20) {
				// change zoom
				lastWheel = now;

				viewZoom += viewZoom * delta;

				if (viewZoom > 20.0) viewZoom = 20.0;
				else if (viewZoom < 0.5) {
					viewZoom = 0.5;
					//viewXpos = 0.0;
				} else {
					var mousePositionZoomCorrectionX = (((mouseX - canvas.width / 2 + viewXpos) * delta) / viewZoom / canvas.width) * 2.0;
					var mousePositionZoomCorrectionY = ((((mouseY - canvas.height / 2 + viewYpos) * delta) / viewZoom / canvas.height) * 2.0) / canvas_aspect;
					viewXpos -= mousePositionZoomCorrectionX;
					viewYpos += mousePositionZoomCorrectionY;
				}

				// let el = document.getElementById("audio");
				// el.play();
				// el.volume = Math.max(viewZoom / 20.0 - 0.1, 0.0); // adjust background noise based on zoom
			}
		}
	});

	window.addEventListener("mousemove", function (event) {
		var rect = canvas.getBoundingClientRect();
		mouseX = event.clientX - rect.left;
		mouseY = event.clientY - rect.top;

		if (middleMousePressed) {
			// drag view position
			viewXpos += ((mouseX - prevMouseX) / viewZoom / canvas.width) * 2.0;
			viewYpos -= ((mouseY - prevMouseY) / viewZoom / canvas.width) * 2.0;

			prevMouseX = mouseX;
			prevMouseY = mouseY;
		}
	});

	canvas.addEventListener("mousedown", function (event) {
		if (event.button == 0) {
			leftMousePressed = true;
		} else if (event.button == 1) {
			// middle mouse button
			middleMousePressed = true;
			prevMouseX = mouseX;
			prevMouseY = mouseY;
		}
	});

	window.addEventListener("mouseup", function (event) {
		if (event.button == 0) {
			leftMousePressed = false;
		} else if (event.button == 1) {
			// middle mouse button
			middleMousePressed = false;
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.keyCode == 17 || event.keyCode == 224) {
			// ctrl or cmd on mac
			ctrlPressed = true;
		} else if (event.keyCode == 66) {
			// B: scrolling to change brush size
			bPressed = true;
		} else if (event.keyCode == 32) {
			// space bar
			guiControls.paused = !guiControls.paused;
		} else if (event.keyCode == 65) {
			// A
			guiControls.showAllDrops = !guiControls.showAllDrops;

			// number keys for displaymodes
		} else if (event.keyCode == 83) {
			// S: log sample at mouse location

			var leftEdge = canvas.width / 2.0 - (canvas.width * viewZoom) / 2.0;
			var rightEdge = canvas.width / 2.0 + (canvas.width * viewZoom) / 2.0;
			var mouseXinSim = map_range(mouseX, leftEdge, rightEdge, 0.0, 1.0) - viewXpos / 2.0;

			var topEdge = canvas.height / 2.0 - ((canvas.width / sim_aspect) * viewZoom) / 2.0;
			var bottemEdge = canvas.height / 2.0 + ((canvas.width / sim_aspect) * viewZoom) / 2.0;
			var mouseYinSim = map_range(mouseY, bottemEdge, topEdge, 0.0, 1.0) - (viewYpos / 2.0) * sim_aspect;

			// mouse position in sim coordinates
			var simXpos = Math.floor(mouseXinSim * sim_res_x);
			var simYpos = Math.floor(mouseYinSim * sim_res_y);

			gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
			gl.readBuffer(gl.COLOR_ATTACHMENT0); // basetexture
			var baseTextureValues = new Float32Array(4);
			gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues); // read single cell

			//gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
			gl.readBuffer(gl.COLOR_ATTACHMENT1); // watertexture
			var waterTextureValues = new Float32Array(4);
			gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues); // read single cell

			gl.readBuffer(gl.COLOR_ATTACHMENT2); // walltexture
			var wallTextureValues = new Int8Array(2);
			gl.readPixels(simXpos, simYpos, 1, 1, gl.RG_INTEGER, gl.BYTE, wallTextureValues);

			gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
			gl.readBuffer(gl.COLOR_ATTACHMENT0); // lighttexture_1
			var lightTextureValues = new Float32Array(4);
			gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, lightTextureValues); // read single cell

			console.log("Base: ", baseTextureValues);
			console.log("Water: ", waterTextureValues);
			console.log("Wall: ", wallTextureValues);
			console.log("Light: ", lightTextureValues);

			//console.log("P:" + baseTextureValues[2] + "T:" + baseTextureValues[3] + "Wall:" + wallTextureValues[0] + ", " + wallTextureValues[1]);

			// number keys for displaymodes
		} else if (event.keyCode == 1 + 48) {
			guiControls.displayMode = "DISP_TEMPERATURE";
		} else if (event.keyCode == 2 + 48) {
			guiControls.displayMode = "DISP_WATER";
		} else if (event.keyCode == 3 + 48) {
			guiControls.displayMode = "DISP_REAL";
		} else if (event.keyCode == 4 + 48) {
			guiControls.displayMode = "DISP_HORIVEL";
		} else if (event.keyCode == 5 + 48) {
			guiControls.displayMode = "DISP_VERTVEL";
		} else if (event.keyCode == 6 + 48) {
			guiControls.displayMode = "DISP_IRHEATING";
		} else if (event.keyCode == 7 + 48) {
			guiControls.displayMode = "DISP_IRDOWNTEMP";
		} else if (event.keyCode == 8 + 48) {
			guiControls.displayMode = "DISP_IRUPTEMP";
		} else if (event.keyCode == 71) {
			// g
			guiControls.showGraph = !guiControls.showGraph;
			hideOrShowGraph();
		}
	});

	document.addEventListener("keyup", (event) => {
		if (event.keyCode == 17 || event.keyCode == 224) {
			ctrlPressed = false;
		} else if (event.keyCode == 66) {
			bPressed = false;
		}
	});

	gl.getExtension("EXT_color_buffer_float");
	gl.getExtension("OES_texture_float_linear");
	gl.getExtension("OES_texture_half_float_linear");

	gl.clearColor(0.0, 0.0, 0.0, 0.0); // background color

	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.disable(gl.DEPTH_TEST);
	//gl.disable(gl.BLEND);
	//gl.enable(gl.BLEND)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	// load shaders
	var shaderFunctionsSource = loadSourceFile("shaders/shaderFunctions.glsl");

	const simVertexShader = loadShader("vertex", "simShader.vert");
	const dispVertexShader = loadShader("vertex", "dispShader.vert");
	const precipDisplayVertexShader = loadShader("vertex", "precipDisplayShader.vert");

	const pressureShader = loadShader("fragment", "pressureShader.frag");
	const velocityShader = loadShader("fragment", "velocityShader.frag");
	const advectionShader = loadShader("fragment", "advectionShader.frag");
	const curlShader = loadShader("fragment", "curlShader.frag");
	const vorticityShader = loadShader("fragment", "vorticityShader.frag");
	const boundaryShader = loadShader("fragment", "boundaryShader.frag");

	const lightingShader = loadShader("fragment", "lightingShader.frag");

	const setupShader = loadShader("fragment", "setupShader.frag");

	const temperatureDisplayShader = loadShader("fragment", "temperatureDisplayShader.frag");
	const precipDisplayShader = loadShader("fragment", "precipDisplayShader.frag");
	const universalDisplayShader = loadShader("fragment", "universalDisplayShader.frag");
	const skyBackgroundDisplayShader = loadShader("fragment", "skyBackgroundDisplayShader.frag");
	const realisticDisplayShader = loadShader("fragment", "realisticDisplayShader.frag");
	const IRtempDisplayShader = loadShader("fragment", "IRtempDisplayShader.frag");

	// create programs
	const pressureProgram = createProgram(simVertexShader, pressureShader);
	const velocityProgram = createProgram(simVertexShader, velocityShader);
	const advectionProgram = createProgram(simVertexShader, advectionShader);
	const curlProgram = createProgram(simVertexShader, curlShader);
	const vorticityProgram = createProgram(simVertexShader, vorticityShader);
	const boundaryProgram = createProgram(simVertexShader, boundaryShader);

	const lightingProgram = createProgram(simVertexShader, lightingShader);

	const setupProgram = createProgram(simVertexShader, setupShader);

	const temperatureDisplayProgram = createProgram(dispVertexShader, temperatureDisplayShader);
	const precipDisplayProgram = createProgram(precipDisplayVertexShader, precipDisplayShader);
	const universalDisplayProgram = createProgram(dispVertexShader, universalDisplayShader);
	const skyBackgroundDisplayProgram = createProgram(dispVertexShader, skyBackgroundDisplayShader);
	const realisticDisplayProgram = createProgram(dispVertexShader, realisticDisplayShader);
	const IRtempDisplayProgram = createProgram(dispVertexShader, IRtempDisplayShader);

	// // quad that fills the screen, so fragment shader is run for every pixel // X, Y,  U, V  (x4)

	// Don't ask me why, but the * 1.0000001 is nesesary to get exactly round half ( x.5 ) fragcoordinates in the fragmentshaders
	// I figured this out experimentally. It took me days! Without it the linear interpolation would get fucked up because of the tiny offsets
	const quadVertices = [
		// X, Y,  U, V
		1.0,
		-1.0,
		sim_res_x * 1.0000001,
		0.0,
		-1.0,
		-1.0,
		0.0,
		0.0,
		1.0,
		1.0,
		sim_res_x * 1.0000001,
		sim_res_y * 1.0000001,
		-1.0,
		1.0,
		0.0,
		sim_res_y * 1.0000001
	];

	var fluidVao = gl.createVertexArray(); // vertex array object to store bufferData and vertexAttribPointer
	gl.bindVertexArray(fluidVao);
	var VertexBufferObject = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, VertexBufferObject);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);
	var positionAttribLocation = gl.getAttribLocation(pressureProgram, "vertPosition"); // 0 these positions are the same for every program, since they all use the same vertex shader
	var texCoordAttribLocation = gl.getAttribLocation(pressureProgram, "vertTexCoord"); // 1
	gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(texCoordAttribLocation);
	gl.vertexAttribPointer(
		positionAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		0 // Offset from the beginning of a single vertex to this attribute
	);
	gl.vertexAttribPointer(
		texCoordAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		2 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);

	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	// Precipitation setup

	const precipitationVertexShader = loadShader("vertex", "precipitationShader.vert");
	const precipitationShader = loadShader("fragment", "precipitationShader.frag");
	const precipitationProgram = createProgram(precipitationVertexShader, precipitationShader, ["position_out", "mass_out", "density_out"]);

	gl.useProgram(precipitationProgram);

	var dropPositionAttribLocation = 0;
	var massAttribLocation = 1;
	var densityAttribLocation = 2;

	var rainDrops = [];

	if (initialRainDrops) {
		rainDrops = initialRainDrops;
	} else {
		// generate droplets
		for (var i = 0; i < NUM_DROPLETS; i++) {
			// seperate push for each element is fastest
			rainDrops.push((Math.random() - 0.5) * 2.0); // X
			rainDrops.push((Math.random() - 0.5) * 2.0); // Y
			rainDrops.push(-10.0 + Math.random()); // water negative to disable
			rainDrops.push(Math.random()); // ice
			rainDrops.push(0.0); // density
		}
	}
	//console.log(NUM_DROPLETS);
	//console.log(rainDrops.length);
	/*
	const rainDrops = [ // test array
		// X, Y, water, ice, density
	   -0.09, -0.99, 1.0, 0.0, 0.5,
		-0.15, 0.99, 2.0, 0.0, 0.5,
		0.29, -0.99, 3.0, 0.0, 0.5,
		0.19,  0.99, 4.0, 0.0, 0.5,
		0.1,  0.0, 5.0, 0.0, 0.5,
		0.2,  0.0, 6.0, 0.0, 0.5
	];
*/

	//console.log(rainDrops);

	var precipitationVao_0 = gl.createVertexArray();
	gl.bindVertexArray(precipitationVao_0);
	var precipVertexBuffer_0 = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, precipVertexBuffer_0);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rainDrops), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(massAttribLocation);
	gl.enableVertexAttribArray(densityAttribLocation);
	gl.vertexAttribPointer(
		dropPositionAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		0 // Offset from the beginning of a single vertex to this attribute
	);
	gl.vertexAttribPointer(
		massAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		2 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);
	gl.vertexAttribPointer(
		densityAttribLocation, // Attribute location
		1, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		4 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);
	const precipitationTF_0 = gl.createTransformFeedback();
	gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, precipitationTF_0);
	gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, precipVertexBuffer_0); // this binds the default (id = 0) TRANSFORM_FEEBACK buffer
	gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
	gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

	var precipitationVao_1 = gl.createVertexArray();
	gl.bindVertexArray(precipitationVao_1);
	var precipVertexBuffer_1 = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, precipVertexBuffer_1);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rainDrops), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(massAttribLocation);
	gl.enableVertexAttribArray(densityAttribLocation);
	gl.vertexAttribPointer(
		dropPositionAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		0 // Offset from the beginning of a single vertex to this attribute
	);
	gl.vertexAttribPointer(
		massAttribLocation, // Attribute location
		2, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		2 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);
	gl.vertexAttribPointer(
		densityAttribLocation, // Attribute location
		1, // Number of elements per attribute
		gl.FLOAT, // Type of elements
		gl.FALSE,
		5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
		4 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
	);
	const precipitationTF_1 = gl.createTransformFeedback();
	gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, precipitationTF_1);
	gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, precipVertexBuffer_1); // this binds the default (id = 0) TRANSFORM_FEEBACK buffer
	gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
	gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

	gl.bindBuffer(gl.ARRAY_BUFFER, null); // buffers are bound via VAO's

	var even = true; // used to switch between precipitation buffers

	// set up framebuffers

	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // default, so no need to set
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); // default, so no need to set

	const baseTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialBaseTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const baseTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialBaseTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const waterTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialWaterTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const waterTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialWaterTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const wallTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, initialWallTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const wallTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, initialWallTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	// gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const frameBuff_0 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTexture_0, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, waterTexture_0, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, wallTexture_0, 0);

	const frameBuff_1 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTexture_1, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, waterTexture_1, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, wallTexture_1, 0);

	const curlTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, curlTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, sim_res_x, sim_res_y, 0, gl.RED, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	const curlFrameBuff = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, curlFrameBuff);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, curlTexture, 0); // attach the texture as the first color attachment

	const vortForceTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, vortForceTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, sim_res_x, sim_res_y, 0, gl.RG, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	const vortForceFrameBuff = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, vortForceFrameBuff);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, vortForceTexture, 0);

	const lightTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.HALF_FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	const lightFrameBuff_0 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightTexture_0, 0);

	const lightTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, lightTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.HALF_FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	const lightFrameBuff_1 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_1);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightTexture_1, 0);

	const precipitationFeedbackTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	const precipitationFeedbackFrameBuff = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, precipitationFeedbackFrameBuff);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, precipitationFeedbackTexture, 0);

	// load images
	var imgElement = document.getElementById("noiseImg");
	//console.log(imgElement.width);
	const noiseTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgElement.width, imgElement.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // default, so no need to set
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); // default, so no need to set

	var texelSizeX = 1.0 / sim_res_x;
	var texelSizeY = 1.0 / sim_res_y;

	var dryLapse = (guiControls.simHeight * guiControls.dryLapseRate) / 1000.0; // total lapse rate from bottem to top of atmosphere

	function CtoK(c) {
		return c + 273.15;
	}

	function realToPotentialT(real, y) {
		return real + (y / sim_res_y) * dryLapse;
	}

	// generate Initial temperature profile

	var initial_T = new Float32Array(sim_res_y + 1);

	for (var y = 0; y < sim_res_y + 1; y++) {
		var realTemp = Math.max(map_range(y, 0, sim_res_y + 1, 22.0, -65.0), -55.0); // standard atmosphere
		if (y < sim_res_y * 0.15) {
			realTemp = map_range(y, (sim_res_y + 1) * 0.15, 0, 4, 20);
		}

		// var realTemp = Math.max(map_range(y, 0, sim_res_y+1, 5.0, -65.0), -55.0); // cold atmosphere
		// if (y < sim_res_y * 0.45) {
		// 	realTemp = map_range(y, (sim_res_y+1) * 0.15, 0, -10, 5);
		// }

		//var realTemp = Math.max(map_range(y, 0, sim_res_y, 10.0, 10.0), 10.0);

		initial_T[y] = realToPotentialT(CtoK(realTemp), y); // initial temperature profile
	}

	// Set constant uniforms
	gl.useProgram(setupProgram);
	gl.uniform2f(gl.getUniformLocation(setupProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform2f(gl.getUniformLocation(setupProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform1f(gl.getUniformLocation(setupProgram, "dryLapse"), dryLapse);
	gl.uniform1fv(gl.getUniformLocation(setupProgram, "initial_T"), initial_T);

	gl.useProgram(advectionProgram);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "waterTex"), 1);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "wallTex"), 2);
	gl.uniform2f(gl.getUniformLocation(advectionProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform2f(gl.getUniformLocation(advectionProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform1fv(gl.getUniformLocation(advectionProgram, "initial_T"), initial_T);
	gl.uniform1f(gl.getUniformLocation(advectionProgram, "dryLapse"), dryLapse);
	gl.uniform1f(gl.getUniformLocation(advectionProgram, "evapHeat"), guiControls.evapHeat);
	gl.uniform1f(gl.getUniformLocation(advectionProgram, "meltingHeat"), guiControls.meltingHeat);

	gl.useProgram(pressureProgram);
	gl.uniform1i(gl.getUniformLocation(pressureProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(pressureProgram, "wallTex"), 1);
	gl.uniform2f(gl.getUniformLocation(pressureProgram, "texelSize"), texelSizeX, texelSizeY);

	gl.useProgram(velocityProgram);
	gl.uniform1i(gl.getUniformLocation(velocityProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(velocityProgram, "wallTex"), 1);
	gl.uniform2f(gl.getUniformLocation(velocityProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(velocityProgram, "dragMultiplier"), guiControls.dragMultiplier);
	gl.uniform1fv(gl.getUniformLocation(velocityProgram, "initial_T"), initial_T);
	gl.uniform1f(gl.getUniformLocation(velocityProgram, "wind"), guiControls.wind);

	gl.useProgram(vorticityProgram);
	gl.uniform2f(gl.getUniformLocation(vorticityProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "curlTex"), 0);

	gl.useProgram(boundaryProgram);
	gl.uniform1i(gl.getUniformLocation(boundaryProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(boundaryProgram, "waterTex"), 1);
	gl.uniform1i(gl.getUniformLocation(boundaryProgram, "vortForceTex"), 2);
	gl.uniform1i(gl.getUniformLocation(boundaryProgram, "wallTex"), 3);
	gl.uniform1i(gl.getUniformLocation(boundaryProgram, "lightTex"), 4);
	gl.uniform1i(gl.getUniformLocation(boundaryProgram, "precipFeedbackTex"), 5);
	gl.uniform2f(gl.getUniformLocation(boundaryProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(boundaryProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "vorticity"), guiControls.vorticity); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "sunIntensity"), guiControls.sunIntensity * 0.002); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "waterTemperature"), CtoK(guiControls.waterTemperature)); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "dryLapse"), dryLapse);
	//gl.uniform1f(gl.getUniformLocation(boundaryProgram, "evapHeat"), guiControls.evapHeat);
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "landEvaporation"), guiControls.landEvaporation);
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "waterEvaporation"), guiControls.waterEvaporation);
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "waterWeight"), guiControls.waterWeight);
	gl.uniform1fv(gl.getUniformLocation(boundaryProgram, "initial_T"), initial_T);
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "IR_rate"), guiControls.IR_rate);
	gl.uniform1f(gl.getUniformLocation(boundaryProgram, "sunAngle"), guiControls.sunAngle * degToRad);

	gl.useProgram(curlProgram);
	gl.uniform2f(gl.getUniformLocation(curlProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(curlProgram, "baseTex"), 0);

	gl.useProgram(lightingProgram);
	gl.uniform2f(gl.getUniformLocation(lightingProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(lightingProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(lightingProgram, "sunAngle"), guiControls.sunAngle * degToRad);
	gl.uniform1f(gl.getUniformLocation(lightingProgram, "dryLapse"), dryLapse);
	gl.uniform1f(gl.getUniformLocation(lightingProgram, "waterTemperature"), CtoK(guiControls.waterTemperature));
	gl.uniform1i(gl.getUniformLocation(lightingProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(lightingProgram, "waterTex"), 1);
	gl.uniform1i(gl.getUniformLocation(lightingProgram, "wallTex"), 2);
	gl.uniform1i(gl.getUniformLocation(lightingProgram, "lightTex"), 3);
	gl.uniform1f(gl.getUniformLocation(lightingProgram, "sunIntensity"), guiControls.sunIntensity * 0.002);

	// Display programs:
	gl.useProgram(temperatureDisplayProgram);
	gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "wallTex"), 1);
	gl.uniform1f(gl.getUniformLocation(temperatureDisplayProgram, "dryLapse"), dryLapse);

	gl.useProgram(precipDisplayProgram);
	gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(precipDisplayProgram, "waterTex"), 0);
	gl.uniform1i(gl.getUniformLocation(precipDisplayProgram, "wallTex"), 1);

	gl.useProgram(skyBackgroundDisplayProgram);
	gl.uniform2f(gl.getUniformLocation(skyBackgroundDisplayProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(skyBackgroundDisplayProgram, "texelSize"), texelSizeX, texelSizeY);

	gl.useProgram(universalDisplayProgram);
	gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "anyTex"), 0);
	gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "wallTex"), 1);

	gl.useProgram(realisticDisplayProgram);
	gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "wallTex"), 1);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "waterTex"), 2);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "lightTex"), 3);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "noiseTex"), 4);
	gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, "dryLapse"), dryLapse);

	gl.useProgram(precipitationProgram);
	gl.uniform1i(gl.getUniformLocation(precipitationProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(precipitationProgram, "waterTex"), 1);
	gl.uniform2f(gl.getUniformLocation(precipitationProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(precipitationProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(precipitationProgram, "dryLapse"), dryLapse);
	gl.uniform1f(gl.getUniformLocation(precipitationProgram, "evapHeat"), guiControls.evapHeat);
	gl.uniform1f(gl.getUniformLocation(precipitationProgram, "meltingHeat"), guiControls.meltingHeat);
	gl.uniform1f(gl.getUniformLocation(precipitationProgram, "waterWeight"), guiControls.waterWeight);

	gl.useProgram(IRtempDisplayProgram);
	gl.uniform2f(gl.getUniformLocation(IRtempDisplayProgram, "resolution"), sim_res_x, sim_res_y);
	gl.uniform2f(gl.getUniformLocation(IRtempDisplayProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, "lightTex"), 0);
	gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, "wallTex"), 1);

	gl.useProgram(skyBackgroundDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(skyBackgroundDisplayProgram, "lightTex"), 3);

	gl.bindVertexArray(fluidVao);

	// if no save file was loaded
	// Use setup shader to set initial conditions
	if (initialWallTex == null) {
		console.log("setupProgram");
		gl.viewport(0, 0, sim_res_x, sim_res_y);
		gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
		gl.useProgram(setupProgram);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1); // render to both framebuffers
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	setInterval(calcFps, 1000); // log fps

	requestAnimationFrame(draw);

	function draw() {
		//gl.clear(gl.COLOR_BUFFER_BIT);

		var leftEdge = canvas.width / 2.0 - (canvas.width * viewZoom) / 2.0;
		var rightEdge = canvas.width / 2.0 + (canvas.width * viewZoom) / 2.0;
		var mouseXinSim = map_range(mouseX, leftEdge, rightEdge, 0.0, 1.0) - viewXpos / 2.0;

		var topEdge = canvas.height / 2.0 - ((canvas.width / sim_aspect) * viewZoom) / 2.0;
		var bottemEdge = canvas.height / 2.0 + ((canvas.width / sim_aspect) * viewZoom) / 2.0;
		var mouseYinSim = map_range(mouseY, bottemEdge, topEdge, 0.0, 1.0) - (viewYpos / 2.0) * sim_aspect;

		gl.disable(gl.BLEND);

		gl.useProgram(advectionProgram);

		var inputType = 0;
		if (leftMousePressed) {
			if (guiControls.tool == "TOOL_TEMPERATURE") inputType = 1;
			else if (guiControls.tool == "TOOL_WATER") inputType = 2;
			else if (guiControls.tool == "TOOL_SMOKE") inputType = 3;
			else if (guiControls.tool == "TOOL_WALL") inputType = 10;
			else if (guiControls.tool == "TOOL_WALL_LAND") inputType = 11;
			else if (guiControls.tool == "TOOL_WALL_SEA") inputType = 12;
			else if (guiControls.tool == "TOOL_WALL_FIRE") inputType = 13;

			var intensity = guiControls.intensity;

			if (ctrlPressed) {
				intensity *= -1;
			}

			var posXinSim = mouseXinSim;

			if (guiControls.wholeWidth) {
				posXinSim = -1.0;
			}

			gl.uniform4f(gl.getUniformLocation(advectionProgram, "userInputValues"), posXinSim, mouseYinSim, intensity, guiControls.brushSize);
		}
		gl.uniform1i(gl.getUniformLocation(advectionProgram, "userInputType"), inputType); // 0 = nothing 	1 = temp	 2 = wall	3 = heating wall	4 = cooling wall

		if (!guiControls.paused) {
			if (guiControls.dayNightCycle) updateSunlight(0.005);

			gl.viewport(0, 0, sim_res_x, sim_res_y);
			// IterPerFrame

			for (var i = 0; i < IterPerFrame; i++) {
				// calc and apply velocity
				gl.useProgram(velocityProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc curl
				gl.useProgram(curlProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, curlFrameBuff);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calculate vorticity
				gl.useProgram(vorticityProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, curlTexture);
				gl.bindFramebuffer(gl.FRAMEBUFFER, vortForceFrameBuff);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// apply vorticity, boundary conditions and user input
				gl.useProgram(boundaryProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, vortForceTexture);
				gl.activeTexture(gl.TEXTURE3);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				gl.activeTexture(gl.TEXTURE4);
				gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
				gl.activeTexture(gl.TEXTURE5);
				gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc and apply advection
				gl.useProgram(advectionProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc and apply pressure
				gl.useProgram(pressureProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc light
				gl.useProgram(lightingProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				gl.activeTexture(gl.TEXTURE3);

				if (even) {
					gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
					gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_1);

					srcVAO = precipitationVao_0;
					destTF = precipitationTF_1;
					destVAO = precipitationVao_1; // for display
				} else {
					gl.bindTexture(gl.TEXTURE_2D, lightTexture_1);
					gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);

					srcVAO = precipitationVao_1;
					destTF = precipitationTF_0;
					destVAO = precipitationVao_0; // for display
				}
				even = !even;

				gl.drawBuffers([gl.COLOR_ATTACHMENT0]); // calc light
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// move precipitation
				gl.useProgram(precipitationProgram);
				gl.uniform1f(gl.getUniformLocation(precipitationProgram, "frameNum"), frameNum);
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.ONE, gl.ONE); // add everything together
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, precipitationFeedbackFrameBuff);
				gl.clear(gl.COLOR_BUFFER_BIT);
				gl.bindVertexArray(srcVAO);
				gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, destTF);
				gl.beginTransformFeedback(gl.POINTS);
				gl.drawArrays(gl.POINTS, 0, NUM_DROPLETS);
				gl.endTransformFeedback();
				gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
				gl.disable(gl.BLEND);
				gl.bindVertexArray(fluidVao); // set screenfilling rect again
			}

			if (frameNum % 60 == 0) {
				// count number of inactive droplets

				gl.bindFramebuffer(gl.FRAMEBUFFER, precipitationFeedbackFrameBuff);
				gl.readBuffer(gl.COLOR_ATTACHMENT0);
				var sampleValues = new Float32Array(4);
				gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, sampleValues); //console.log(sampleValues[3]); // number of inactive droplets
				//console.log(sampleValues[3]); // number of inactive droplets
				guiControls.inactiveDroplets = sampleValues[3];
				gl.useProgram(precipitationProgram);
				gl.uniform1f(gl.getUniformLocation(precipitationProgram, "inactiveDroplets"), sampleValues[3]);
			}
		}

		if (guiControls.showGraph) {
			soundingGraph.draw(Math.floor(mouseXinSim * sim_res_x), Math.floor(mouseYinSim * sim_res_y));
		}

		// render to canvas
		gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is canvas
		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);

		if (guiControls.displayMode == "DISP_REAL") {
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
			gl.activeTexture(gl.TEXTURE3);
			gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
			gl.activeTexture(gl.TEXTURE4);
			gl.bindTexture(gl.TEXTURE_2D, noiseTexture);

			// draw background
			gl.useProgram(skyBackgroundDisplayProgram);
			gl.uniform2f(gl.getUniformLocation(skyBackgroundDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
			gl.uniform3f(gl.getUniformLocation(skyBackgroundDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
			//gl.activeTexture(gl.TEXTURE0);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to canvas

			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			/*
			if (!guiControls.showAllDrops) {
				// draw drops under clouds
				// draw precipitation
				gl.useProgram(precipDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(precipDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
				gl.bindVertexArray(destVAO);
				gl.drawArrays(gl.POINTS, 0, NUM_DROPLETS);
				gl.bindVertexArray(fluidVao); // set screenfilling rect again
			}*/

			// draw clouds
			gl.useProgram(realisticDisplayProgram);
			gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
			gl.uniform3f(gl.getUniformLocation(realisticDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to canvas

			if (guiControls.showAllDrops) {
				// draw drops over clouds
				// draw precipitation
				gl.useProgram(precipDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(precipDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
				gl.bindVertexArray(destVAO);
				gl.drawArrays(gl.POINTS, 0, NUM_DROPLETS);
				gl.bindVertexArray(fluidVao); // set screenfilling rect again
			}
		} else {
			if (guiControls.displayMode == "DISP_TEMPERATURE") {
				gl.useProgram(temperatureDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(temperatureDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
			} else if (guiControls.displayMode == "DISP_IRDOWNTEMP") {
				gl.useProgram(IRtempDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(IRtempDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(IRtempDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);

				gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, "upOrDown"), 0);

				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
			} else if (guiControls.displayMode == "DISP_IRUPTEMP") {
				gl.useProgram(IRtempDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(IRtempDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(IRtempDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);

				gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, "upOrDown"), 1);

				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
			} else {
				gl.useProgram(universalDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(universalDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);

				switch (guiControls.displayMode) {
					case "DISP_HORIVEL":
						gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 0);
						gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 10.0); // 20.0
						break;
					case "DISP_VERTVEL":
						gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 1);
						gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 10.0); // 20.0
						break;
					case "DISP_WATER":
						gl.activeTexture(gl.TEXTURE0);
						gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
						gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 0);
						gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), -0.06); // negative number so positive amount is blue
						break;
					case "DISP_IRHEATING":
						gl.activeTexture(gl.TEXTURE0);
						gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
						gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 1);
						gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 50000.0);
						break;
				}
			}

			//	gl.bindTexture(gl.TEXTURE_2D, curlTexture);
			//	gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to canvas
		}

		frameNum++;
		requestAnimationFrame(draw);
	}

	//////////////////////////////////////////////////////// functions:

	function hideOrShowGraph() {
		if (guiControls.showGraph) {
			soundingGraph.graphCanvas.style.display = "block";
		} else {
			soundingGraph.graphCanvas.style.display = "none";
		}
	}

	function updateSunlight(adjustment) {
		if (adjustment != null) {
			guiControls.timeOfDay += adjustment; // day angle in degrees
			if (guiControls.timeOfDay >= 240.0) guiControls.timeOfDay = 0.0; // should be 360 for equator
		}

		guiControls.sunAngle = guiControls.timeOfDay - 90.0;

		//console.log(guiControls.sunAngle);

		//	let sunIntensity = guiControls.sunIntensity * Math.pow(Math.max(Math.sin((90.0 - Math.abs(guiControls.sunAngle)) * degToRad) - 0.1, 0.0) * 1.111, 0.4);

		let sunIntensity = guiControls.sunIntensity * Math.pow(Math.max(Math.sin((90.0 - Math.abs(guiControls.sunAngle)) * degToRad), 0.0), 0.2);

		gl.useProgram(boundaryProgram);
		gl.uniform1f(gl.getUniformLocation(boundaryProgram, "sunIntensity"), sunIntensity);
		gl.uniform1f(gl.getUniformLocation(boundaryProgram, "sunAngle"), guiControls.sunAngle * degToRad);
		gl.useProgram(lightingProgram);
		gl.uniform1f(gl.getUniformLocation(lightingProgram, "sunIntensity"), sunIntensity);
		gl.uniform1f(gl.getUniformLocation(lightingProgram, "sunAngle"), guiControls.sunAngle * degToRad);
		gl.useProgram(realisticDisplayProgram);
		gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, "sunAngle"), guiControls.sunAngle * degToRad);
	}

	async function prepareDownload() {
		var newFileName = prompt("Please enter a file name. Can not include '.'", saveFileName);

		if (newFileName != null) {
			if (newFileName != "" && !newFileName.includes(".")) {
				saveFileName = newFileName;

				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.readBuffer(gl.COLOR_ATTACHMENT0);
				let baseTextureValues = new Float32Array(4 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseTextureValues);
				gl.readBuffer(gl.COLOR_ATTACHMENT1);
				let waterTextureValues = new Float32Array(4 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues);
				gl.readBuffer(gl.COLOR_ATTACHMENT2);
				let wallTextureValues = new Int8Array(2 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RG_INTEGER, gl.BYTE, wallTextureValues);

				let precipBufferValues = new ArrayBuffer(rainDrops.length * Float32Array.BYTES_PER_ELEMENT);
				gl.bindBuffer(gl.ARRAY_BUFFER, precipVertexBuffer_0);
				gl.getBufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(precipBufferValues));
				gl.bindBuffer(gl.ARRAY_BUFFER, null); // disbind again

				let saveDataArray = [Uint16Array.of(sim_res_x), Uint16Array.of(sim_res_y), baseTextureValues, waterTextureValues, wallTextureValues, precipBufferValues];
				let blob = new Blob(saveDataArray); // combine everything into blob
				let arrBuff = await blob.arrayBuffer(); // turn into array
				let arr = new Uint8Array(arrBuff);
				let compressed = window.pako.deflate(arr); // compress
				let compressedBlob = new Blob([Uint32Array.of(saveFileVersionID), compressed], { type: "application/x-binary" }); // turn back into blob and add version id
				download(saveFileName + ".weathersim", compressedBlob);
			} else {
				alert("You didn't enter a valid file name!");
			}
		}
	}

	function createProgram(vertexShader, fragmentShader, transform_feedback_varyings) {
		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);

		if (transform_feedback_varyings != null) gl.transformFeedbackVaryings(program, transform_feedback_varyings, gl.INTERLEAVED_ATTRIBS);

		gl.linkProgram(program);
		gl.validateProgram(program);
		if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
			return program; // linked succesfully
		} else {
			throw "ERROR: " + gl.getProgramInfoLog(program);
			gl.deleteProgram(program);
		}
	}

	function loadSourceFile(fileName) {
		var request = new XMLHttpRequest();
		request.open("GET", fileName, false);
		request.send(null);
		if (request.status === 200) return request.responseText;
		else return null;
	}

	function loadShader(typeIn, nameIn) {
		let filename = "shaders/" + typeIn + "/" + nameIn;

		console.log(filename);

		let shaderType;

		if (typeIn == "vertex") {
			shaderType = gl.VERTEX_SHADER;
		} else if (typeIn == "fragment") {
			shaderType = gl.FRAGMENT_SHADER;
		}

		var shaderSource = loadSourceFile(filename);
		if (shaderSource) {
			if (shaderSource.includes("#include functions")) {
				shaderSource = shaderSource.replace("#include functions", shaderFunctionsSource);
			}

			const shader = gl.createShader(shaderType);
			gl.shaderSource(shader, shaderSource);
			gl.compileShader(shader);

			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				// problem compiling shader
				throw fileName + " COMPILATION " + gl.getShaderInfoLog(shader);
			}
			return shader;
		}
	}

	function calcFps() {
		var FPS = frameNum - lastFrameNum;
		lastFrameNum = frameNum;

		console.log(FPS + " FPS   " + IterPerFrame + " Iterations / frame      " + FPS * IterPerFrame + " Iterations / second");

		const fpsTarget = 60;

		if (!maxIterFound && !guiControls.paused) {
			if (FPS >= fpsTarget) IterPerFrame++;
			else if (FPS < fpsTarget && calcCount > 5) {
				IterPerFrame--;
				maxIterFound = true;
			}
		}
		calcCount++;
	}
};
