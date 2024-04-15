var canvas;
var gl;

const saveFileVersionID = 708683114; // randomly generated id to check if save file is compatible

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
var viewZoom = 1.0;

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

function calcFps() {
	var FPS = frameNum - lastFrameNum;
	lastFrameNum = frameNum;

	console.log(FPS + " FPS   " + IterPerFrame + " Iterations / frame      " + FPS * IterPerFrame + " Iterations / second");

	const fpsTarget = 60;

	if (!maxIterFound) {
		if (FPS >= fpsTarget) IterPerFrame++;
		else if (FPS < fpsTarget && calcCount > 5) {
			IterPerFrame--;
			maxIterFound = true;
		}
	}
	calcCount++;
}

async function loadData() {
	var file = document.getElementById("fileInput").files[0];

	if (file) {
		var versionBlob = file.slice(0, 4);
		var resBlob = file.slice(4, 8);

		var versionBuf = await versionBlob.arrayBuffer();
		var resBuf = await resBlob.arrayBuffer();

		var version = new Uint32Array(versionBuf)[0];

		if (version == saveFileVersionID) {
			// only proceed if file has the right version id
			resArray = new Uint16Array(resBuf);
			sim_res_x = resArray[0];
			sim_res_y = resArray[1];

			saveFileName = file.name;

			if (saveFileName.includes(".")) {
				saveFileName = saveFileName.split(".").slice(0, -1).join("."); // remove extension
			}

			console.log("loading file: " + saveFileName);
			// console.log("File versionID: " + version);
			// console.log("sim_res_x: " + sim_res_x);
			// console.log("sim_res_y: " + sim_res_y);

			var baseTexSize = sim_res_x * sim_res_y * 4 * 4; // in bytes
			var baseTexBlob = file.slice(8, 8 + baseTexSize);
			var baseTexBuf = await baseTexBlob.arrayBuffer();
			var baseTexF32 = new Float32Array(baseTexBuf);

			var waterTexSize = sim_res_x * sim_res_y * 4 * 4; // in bytes
			var waterTexBlob = file.slice(8 + baseTexSize, 8 + baseTexSize + waterTexSize);
			var waterTexBuf = await waterTexBlob.arrayBuffer();
			var waterTexF32 = new Float32Array(waterTexBuf);

			//var wallTexSize = sim_res_x * sim_res_y * 2 * 1; // in bytes
			var wallTexBlob = file.slice(8 + baseTexSize + waterTexSize); // from this to end of file
			var wallTexBuf = await wallTexBlob.arrayBuffer();
			var wallTexI8 = new Int8Array(wallTexBuf);

			//	console.log(wallTexI8);
			mainScript(baseTexF32, waterTexF32, wallTexI8);
		} else {
			alert("Incompatible file!");
		}
	} else {
		// no file, so create new simulation
		sim_res_x = parseInt(document.getElementById("simResSelX").value);
		sim_res_y = parseInt(document.getElementById("simResSelY").value);
		mainScript(null);
	}
}

var mainScript = function (initialBaseTex, initialWaterTex, initialWallTex) {
	canvas = document.getElementById("mainCanvas");
	gl = canvas.getContext("webgl2");

	if (!gl) {
		alert("Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera");
		throw " Error: Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera";
	}

	// SETUP GUI

	var guiControls = {
		vorticity: 0.007,
		dragMultiplier: 0.001,
		landHeating: 0.0001,
		waterTemperature: 20,
		landEvaporation: 0.0003,
		waterEvaporation: 0.0005,
		evapHeat: 2.5,
		meltingHeat: 0.5,
		waterWeight: 0.00001,
		displayMode: "DISP_REAL",
		sunAngle: -30.0,
		smooth: false,
		tool: "TOOL_WATER",
		brushSize: 10,
		wholeWidth: false,
		intensity: 0.01,
		showGraph: false,
		paused: false,
		download: function () {
			prepareDownload();
		},
		dryLapseRate: 9.81, // degrees / km
		simHeight: 13000 // meters
	};

	var datGui = new dat.GUI();
	/*
	var folder1 = datGui.addFolder("Atmospheric ");
	folder1.add(guiControls, "dryLapseRate", 0.0, 20.0);
*/
	datGui
		.add(guiControls, "vorticity", 0.0, 0.05)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "vorticity"), guiControls.vorticity);
		})
		.name("Vorticity");

	datGui
		.add(guiControls, "dragMultiplier", 0.0, 2.0)
		.onFinishChange(function () {
			gl.useProgram(velocityProgram);
			gl.uniform1f(gl.getUniformLocation(velocityProgram, "dragMultiplier"), guiControls.dragMultiplier);
		})
		.name("Drag");

	datGui.add(guiControls, "displayMode", { "Temperature -18 to 30°C": "DISP_TEMPERATURE", "Water Vapor": "DISP_WATER", Realistic: "DISP_REAL", "Horizontal Velocity": "DISP_HORIVEL", "Vertical Velocity": "DISP_VERTVEL", Precipitation: "DISP_PRECIP" }).name("Display Mode").listen();
	datGui
		.add(guiControls, "sunAngle", -60.0, 60.0)
		.onChange(function () {
			gl.useProgram(realisticDisplayProgram);
			gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, "sunAngle"), guiControls.sunAngle * 0.0174533);
		})
		.name("Sun angle");
	//datGui.add(guiControls, "smooth").name("Smooth");
	datGui.add(guiControls, "tool", { "Change Temperature": "TOOL_TEMPERATURE", "Add / remove water": "TOOL_WATER", "Wall": "TOOL_WALL", "Land": "TOOL_WALL_HEAT", "Water": "TOOL_WALL_COOL" }).name("Tool");
	datGui.add(guiControls, "brushSize", 1, 100).name("Brush Radius");
	datGui.add(guiControls, "wholeWidth").name("Whole Width Brush");
	datGui.add(guiControls, "intensity", 0.005, 0.05).name("Brush Intensity");
	datGui
		.add(guiControls, "landHeating", -0.001, 0.001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "landHeating"), guiControls.landHeating);
		})
		.name("Land heating");
	datGui
		.add(guiControls, "waterTemperature", 0.0, 35.0)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "waterTemperature"), CtoK(guiControls.waterTemperature));
		})
		.name("Water temperature");
	datGui
		.add(guiControls, "landEvaporation", 0.0, 0.001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "landEvaporation"), guiControls.landEvaporation);
		})
		.name("Land evaporation");
	datGui
		.add(guiControls, "waterEvaporation", 0.0, 0.001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "waterEvaporation"), guiControls.waterEvaporation);
		})
		.name("Water evaporation");
	datGui
		.add(guiControls, "evapHeat", 0.0, 5.0)
		.onFinishChange(function () {
			gl.useProgram(advectionProgram);
			gl.uniform1f(gl.getUniformLocation(advectionProgram, "evapHeat"), guiControls.evapHeat);
		})
		.name("Evaporation heat");
	datGui
		.add(guiControls, "meltingHeat", 0.0, 5.0)
		.onFinishChange(function () {
			gl.useProgram(advectionProgram);
			gl.uniform1f(gl.getUniformLocation(advectionProgram, "meltingHeat"), guiControls.meltingHeat);
		})
		.name("Melting heat");
		datGui
		.add(guiControls, "waterWeight", 0.0, 0.0001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "waterWeight"), guiControls.waterWeight);
		})
		.name("Water weight");
	datGui
		.add(guiControls, "showGraph")
		.onChange(function () {
			hideOrShowGraph();
		})
		.name("Show Sounding Graph")
		.listen();
	datGui.add(guiControls, "paused").name("Paused").listen();
	datGui.add(guiControls, "download").name("Save simulation to file");

	datGui.width = 350;

	// END OF GUI

	var soundingGraph = {
		canvas: null,
		ctx: null,
		init: function () {
			this.canvas = document.getElementById("graphCanvas");
			this.canvas.height = window.innerHeight;
			this.canvas.width = 500;
			this.ctx = this.canvas.getContext("2d");
			var style = this.canvas.style;
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

			const graphBottem = this.canvas.height - 30; // in pixels

			var c = this.ctx;

			c.clearRect(0, 0, canvas.width, canvas.height);
			c.fillStyle = "#00000055";
			c.fillRect(0, 0, canvas.width, canvas.height);

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
						c.fillText("" + Math.round(map_range(y, 0, sim_res_y, 0, guiControls.simHeight)) + " m", 5, scrYpos + 5);
						c.strokeStyle = "#FFF";
						c.lineWidth = 1.0;
						c.strokeRect(T_to_Xpos(temp, scrYpos), scrYpos, 10, 1); // vertical position indicator
						c.fillText("" + temp.toFixed(1) + "°C", T_to_Xpos(temp, scrYpos) + 20, scrYpos + 5);
					}

					c.lineTo(T_to_Xpos(temp, scrYpos), scrYpos); // temperature
				}
			}
			c.lineWidth = 3.0;
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
					c.fillText("" + Math.round(map_range(y, 0, sim_res_y, 0, guiControls.simHeight)) + " m", 5, scrYpos + 5);
					c.strokeStyle = "#FFF";
					c.lineWidth = 1.0;
					c.strokeRect(T_to_Xpos(dewPoint, scrYpos) - 10, scrYpos, 10, 1); // vertical position indicator
					c.fillText("" + dewPoint.toFixed(1) + "°C", T_to_Xpos(dewPoint, scrYpos) - 70, scrYpos + 5);
				}
				c.lineTo(T_to_Xpos(dewPoint, scrYpos), scrYpos); // temperature
			}

			c.lineWidth = 3.0;
			c.strokeStyle = "#0000FF";
			c.stroke();

			// Draw rising parcel temperature line

			var water = waterTextureValues[4 * simYpos];
			var potentialTemp = baseTextureValues[4 * simYpos + 3];
			var initialTemperature = potentialTemp - ((simYpos / sim_res_y) * guiControls.simHeight * guiControls.dryLapseRate) / 1000.0;
			var initialCloudWater = waterTextureValues[4 * simYpos + 1];

			var prevTemp = initialTemperature;
			var prevCloudWater = initialCloudWater;

			var drylapsePerCell = ((-1.0 / sim_res_y) * guiControls.simHeight * guiControls.dryLapseRate) / 1000.0;

			reachedSaturation = false;

			c.beginPath();
			var scrYpos = map_range(simYpos, sim_res_y, 0, 0, graphBottem);
			c.moveTo(T_to_Xpos(KtoC(initialTemperature), scrYpos), scrYpos);
			for (var y = simYpos; y < sim_res_y; y++) {
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
					c.strokeStyle = "#008800";
					c.stroke();
					c.beginPath();
					c.moveTo(T_to_Xpos(KtoC(T), scrYpos), scrYpos); // temperature
				}
			}

			c.lineWidth = 3.0;
			if (reachedSaturation) c.strokeStyle = "#00FF00";
			else c.strokeStyle = "#008800";

			c.stroke();

			function T_to_Xpos(T, y) {
				// temperature to horizontal position
				return T * 7.5 + 780.0 - 600.0 * (y / graphBottem);
			}

			function drawIsotherms() {
				c.strokeStyle = "#964B00";
				c.beginPath();
				c.fillStyle = "white";

				for (var T = -70.0; T <= 40.0; T += 10.0) {
					c.moveTo(T_to_Xpos(T, graphBottem), graphBottem);
					c.lineTo(T_to_Xpos(T, 0), 0);

					if (T >= -20.0) c.fillText(Math.round(T) + "°C", T_to_Xpos(T, graphBottem) - 20, this.canvas.height - 5);
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
		}
	};
	soundingGraph.init();

	const sim_aspect = sim_res_x / sim_res_y;

	var canvas_aspect;
	{
		var element = document.getElementById("IntroScreen");
		element.parentNode.removeChild(element);

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		canvas_aspect = canvas.width / canvas.height;

		window.addEventListener("resize", function () {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			canvas_aspect = canvas.width / canvas.height;

			soundingGraph.canvas.height = window.innerHeight;
		});
	}

	var middleMousePressed = false;
	var leftMousePressed = false;
	var prevMouseX = 0;
	var prevMouseY = 0;
	var mouseX = 0;
	var mouseY = 0;
	var ctrlPressed = false;

	// EVENT LISTENERS

	window.addEventListener("wheel", function (event) {
		var delta = 0.1;
		if (event.deltaY > 0) delta *= -1;
		if (typeof lastWheel == "undefined") lastWheel = 0; // init static variable
		const now = new Date().getTime();

		if (now - lastWheel > 20) {
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
		} else if (event.keyCode == 32) {
			// space bar
			guiControls.paused = !guiControls.paused;
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
			guiControls.displayMode = "DISP_PRECIP";
		} else if (event.keyCode == 71) {
			// g
			guiControls.showGraph = !guiControls.showGraph;
			hideOrShowGraph();
		}
	});

	document.addEventListener("keyup", (event) => {
		if (event.keyCode == 17 || event.keyCode == 224) {
			ctrlPressed = false;
		}
	});

	gl.getExtension("EXT_color_buffer_float");
	gl.getExtension("OES_texture_float_linear");

	gl.clearColor(0.03, 0.03, 0.03, 1.0);

	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.disable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);

	// load shaders
	var shaderFunctionsSource = loadSourceFile("shaderFunctions.glsl");

	const simVertexShader = loadShader(gl.VERTEX_SHADER, "simShader.vert");
	const dispVertexShader = loadShader(gl.VERTEX_SHADER, "dispShader.vert");
	const pressureShader = loadShader(gl.FRAGMENT_SHADER, "pressureShader.frag");
	const velocityShader = loadShader(gl.FRAGMENT_SHADER, "velocityShader.frag");
	const advectionShader = loadShader(gl.FRAGMENT_SHADER, "advectionShader.frag");
	const curlShader = loadShader(gl.FRAGMENT_SHADER, "curlShader.frag");
	const vorticityShader = loadShader(gl.FRAGMENT_SHADER, "vorticityShader.frag");

	const setupShader = loadShader(gl.FRAGMENT_SHADER, "setupShader.frag");

	const temperatureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "temperatureDisplayShader.frag");
	const precipDisplayShader = loadShader(gl.FRAGMENT_SHADER, "precipDisplayShader.frag");
	const universalDisplayShader = loadShader(gl.FRAGMENT_SHADER, "universalDisplayShader.frag");
	const realisticDisplayShader = loadShader(gl.FRAGMENT_SHADER, "realisticDisplayShader.frag");

	// create programs
	const pressureProgram = createProgram(simVertexShader, pressureShader);
	const velocityProgram = createProgram(simVertexShader, velocityShader);
	const advectionProgram = createProgram(simVertexShader, advectionShader);
	const curlProgram = createProgram(simVertexShader, curlShader);
	const vorticityProgram = createProgram(simVertexShader, vorticityShader);

	const setupProgram = createProgram(simVertexShader, setupShader);

	const temperatureDisplayProgram = createProgram(dispVertexShader, temperatureDisplayShader);
	const precipDisplayProgram = createProgram(dispVertexShader, precipDisplayShader);
	const universalDisplayProgram = createProgram(dispVertexShader, universalDisplayShader);
	const realisticDisplayProgram = createProgram(dispVertexShader, realisticDisplayShader);

	// quad that fills the screen, so fragment shader is run for every pixel // X, Y,  U, V  (x4)
	const quadVertices = [1.0, -1.0, 1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 0.0, 1.0];

	var VertexBufferObject = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, VertexBufferObject);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);

	var positionAttribLocation = gl.getAttribLocation(pressureProgram, "vertPosition"); // these positions are the same for every program, since they all use the same vertex shader
	var texCoordAttribLocation = gl.getAttribLocation(pressureProgram, "vertTexCoord");

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

	gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(texCoordAttribLocation);

	// set up framebuffers

	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // default, so no need to set
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); // default, so no need to set

	const baseTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialBaseTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	

	const baseTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	//gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const waterTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialWaterTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const waterTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const wallTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, initialWallTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	const wallTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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

	var initial_T = new Float32Array(sim_res_y);

	for (var y = 0; y < sim_res_y; y++) {
		var realTemp = Math.max(map_range(y, 0, sim_res_y, 22.0, -80.0), -55.0); // standard atmosphere

		if (y < sim_res_y * 0.15) {
			realTemp = map_range(y, sim_res_y * 0.15, 0, 4, 20);
		}

		//var realTemp = Math.max(map_range(y, 0, sim_res_y, 10.0, 10.0), 10.0);

		initial_T[y] = realToPotentialT(CtoK(realTemp), y); // initial temperature profile
	}

	// Set constant uniforms
	gl.useProgram(setupProgram);
	gl.uniform2f(gl.getUniformLocation(setupProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(setupProgram, "dryLapse"), dryLapse);
	gl.uniform1fv(gl.getUniformLocation(setupProgram, "initial_T"), initial_T);

	gl.useProgram(advectionProgram);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "waterTex"), 1);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "wallTex"), 2);
	gl.uniform2f(gl.getUniformLocation(advectionProgram, "texelSize"), texelSizeX, texelSizeY);
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
	gl.uniform1f(gl.getUniformLocation(velocityProgram, "dragMultiplier"), 0.001);
	gl.uniform1fv(gl.getUniformLocation(velocityProgram, "initial_T"), initial_T);

	gl.useProgram(vorticityProgram);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "waterTex"), 1);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "curlTex"), 2);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "wallTex"), 3);
	gl.uniform2f(gl.getUniformLocation(vorticityProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "vorticity"), guiControls.vorticity); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "landHeating"), guiControls.landHeating); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "waterTemperature"), CtoK(guiControls.waterTemperature)); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "dryLapse"), dryLapse);
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "evapHeat"), guiControls.evapHeat);
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "landEvaporation"), guiControls.landEvaporation);
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "waterEvaporation"), guiControls.waterEvaporation);
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "waterWeight"), guiControls.waterWeight);

	gl.useProgram(temperatureDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "wallTex"), 1);
	gl.uniform1f(gl.getUniformLocation(temperatureDisplayProgram, "dryLapse"), dryLapse);

	gl.useProgram(precipDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(precipDisplayProgram, "waterTex"), 0);
	gl.uniform1i(gl.getUniformLocation(precipDisplayProgram, "wallTex"), 1);

	gl.useProgram(universalDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "anyTex"), 0);
	gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "wallTex"), 1);

	gl.useProgram(realisticDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "wallTex"), 1);
	gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, "waterTex"), 2);
	gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, "dryLapse"), dryLapse);
	gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, "sunAngle"), guiControls.sunAngle * 0.0174533);

	gl.useProgram(curlProgram);
	gl.uniform2f(gl.getUniformLocation(curlProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(curlProgram, "baseTex"), 0);

	if (initialWallTex == null) {
		// if no save file was loaded
		// Use setup shader to set initial conditions
		gl.viewport(0, 0, sim_res_x, sim_res_y);
		gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
		gl.useProgram(setupProgram);
		gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	setInterval(calcFps, 1000); // log fps
	requestAnimationFrame(draw);

	function draw() {
		gl.clear(gl.COLOR_BUFFER_BIT);

		var leftEdge = canvas.width / 2.0 - (canvas.width * viewZoom) / 2.0;
		var rightEdge = canvas.width / 2.0 + (canvas.width * viewZoom) / 2.0;
		var mouseXinSim = map_range(mouseX, leftEdge, rightEdge, 0.0, 1.0) - viewXpos / 2.0;

		var topEdge = canvas.height / 2.0 - ((canvas.width / sim_aspect) * viewZoom) / 2.0;
		var bottemEdge = canvas.height / 2.0 + ((canvas.width / sim_aspect) * viewZoom) / 2.0;
		var mouseYinSim = map_range(mouseY, bottemEdge, topEdge, 0.0, 1.0) - (viewYpos / 2.0) * sim_aspect;

		gl.useProgram(advectionProgram);

		var inputType = 0;
		if (leftMousePressed) {
			if (guiControls.tool == "TOOL_TEMPERATURE") inputType = 1;
			else if (guiControls.tool == "TOOL_WATER") inputType = 2;
			else if (guiControls.tool == "TOOL_WALL") inputType = 11;
			else if (guiControls.tool == "TOOL_WALL_HEAT") inputType = 12;
			else if (guiControls.tool == "TOOL_WALL_COOL") inputType = 13;

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
			gl.viewport(0, 0, sim_res_x, sim_res_y);
			// IterPerFrame

			for (var i = 0; i < IterPerFrame; i++) {
				// calc and apply advection
				//console.log("advection");
				gl.useProgram(advectionProgram);
				gl.activeTexture(gl.TEXTURE0); // already set
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // advection needs linear sampling
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				gl.activeTexture(gl.TEXTURE0);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // linear for all other steps
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.activeTexture(gl.TEXTURE1);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

				// calc and apply pressure
				gl.useProgram(pressureProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc and apply velocity
				gl.useProgram(velocityProgram);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
				gl.activeTexture(gl.TEXTURE0);
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

				// calc and apply vorticity
				gl.useProgram(vorticityProgram);
				//	gl.activeTexture(gl.TEXTURE0);
				//	gl.bindTexture(gl.TEXTURE_2D, baseTexture_1); // already set
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, curlTexture);
				gl.activeTexture(gl.TEXTURE3);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				//gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
		}

		if (guiControls.showGraph) {
			soundingGraph.draw(Math.floor(mouseXinSim * sim_res_x), Math.floor(mouseYinSim * sim_res_y));
		}

		// render to canvas
		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);

		if (guiControls.displayMode == "DISP_TEMPERATURE") {
			gl.useProgram(temperatureDisplayProgram);
			gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
			gl.uniform3f(gl.getUniformLocation(temperatureDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
		} else if (guiControls.displayMode == "DISP_REAL") {
			gl.useProgram(realisticDisplayProgram);
			gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
			gl.uniform3f(gl.getUniformLocation(realisticDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
			gl.activeTexture(gl.TEXTURE2);
			gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
			if (guiControls.smooth) {
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			} else {
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			}
		} else if (guiControls.displayMode == "DISP_PRECIP") {
			gl.useProgram(precipDisplayProgram);
			gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
			gl.uniform3f(gl.getUniformLocation(precipDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
		} else {
			gl.useProgram(universalDisplayProgram);
			gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
			gl.uniform3f(gl.getUniformLocation(universalDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);

			switch (guiControls.displayMode) {
				case "DISP_HORIVEL":
					gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 0);
					gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 20.0);
					break;
				case "DISP_VERTVEL":
					gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 1);
					gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 20.0);
					break;
				case "DISP_WATER":
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
					gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 0);
					gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), -0.06); // negative number so positive amount is blue
					break;
			}
		}

		//	gl.bindTexture(gl.TEXTURE_2D, curlTexture);
		//	gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
		gl.activeTexture(gl.TEXTURE0);

		if (guiControls.smooth) {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is canvas
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to canvas

		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

		frameNum++;
		requestAnimationFrame(draw);
	}

	//////////////////////////////////////////////////////// functions:

	function hideOrShowGraph() {
		if (guiControls.showGraph) {
			soundingGraph.canvas.style.display = "block";
		} else {
			soundingGraph.canvas.style.display = "none";
		}
	}

	function prepareDownload() {
		var newFileName = prompt("Please enter a file name. Can not include '.'", saveFileName);

		if (newFileName != null) {
			if (newFileName != "" && !newFileName.includes(".")) {
				saveFileName = newFileName;

				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.readBuffer(gl.COLOR_ATTACHMENT0);
				var baseTextureValues = new Float32Array(4 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseTextureValues);
				gl.readBuffer(gl.COLOR_ATTACHMENT1);
				var waterTextureValues = new Float32Array(4 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues);
				gl.readBuffer(gl.COLOR_ATTACHMENT2);
				var wallTextureValues = new Int8Array(2 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RG_INTEGER, gl.BYTE, wallTextureValues);
				var blobDataArray = [Uint32Array.of(saveFileVersionID), Uint16Array.of(sim_res_x), Uint16Array.of(sim_res_y), baseTextureValues, waterTextureValues, wallTextureValues];
				var blob = new Blob(blobDataArray, { type: "application/x-binary" });

				download(saveFileName + ".weathersim", blob);
			} else {
				alert("You didn't enter a valid file name!");
			}
		}
	}

	function createProgram(vertexShader, fragmentShader) {
		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
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

	function loadShader(shaderType, fileName) {
		var shaderSource = loadSourceFile(fileName);
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
};
