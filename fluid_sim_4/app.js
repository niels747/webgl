var canvas;
var gl;

const saveFileVersionID = 3582619365; // randomly generated id to check if save file is compatible

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

function map_range(value, low1, high1, low2, high2) {
	return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1);
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
			// only proceed if file has the right version
			resArray = new Uint16Array(resBuf);
			sim_res_x = resArray[0];
			sim_res_y = resArray[1];

			saveFileName = file.name;

			if (saveFileName.includes(".")) {
				saveFileName = saveFileName.split(".").slice(0, -1).join("."); // remove extension
			}

			console.log("loading file: " + saveFileName);
			console.log("File versionID: " + version);
			console.log("sim_res_x: " + sim_res_x);
			console.log("sim_res_y: " + sim_res_y);

			var baseTexSize = sim_res_x * sim_res_y * 4 * 4; // in bytes
			var baseTexBlob = file.slice(8, 8 + baseTexSize);
			var baseTexBuf = await baseTexBlob.arrayBuffer();
			var baseTexF32 = new Float32Array(baseTexBuf);

			//var wallTexSize = sim_res_x * sim_res_y * 2 * 1; // in bytes
			var wallTexBlob = file.slice(8 + baseTexSize); // from this to end of file
			var wallTexBuf = await wallTexBlob.arrayBuffer();
			var wallTexI8 = new Int8Array(wallTexBuf);

			//	console.log(wallTexI8);
			mainScript(baseTexF32, wallTexI8);
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

var mainScript = function (initialBaseTex, initialWallTex) {
	canvas = document.getElementById("mainCanvas");
	gl = canvas.getContext("webgl2");

	if (!gl) {
		alert("Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera");
		throw " Error: Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera";
	}

	// SETUP GUI

	var guiControls = {
		vorticity: 0.005,
		dragMultiplier: 0.001,
		wallHeating: 0.0001,
		wallCooling: 0.0001,
		displayMode: "DISP_TEMPERATURE",
		tool: "TOOL_TEMPERATURE",
		brushSize: 50,
		intensity: 0.005,
		showGraph: false,
		paused: false,
		download: function () {
			prepareDownload();
		}
	};

	var datGui = new dat.GUI();
	datGui
		.add(guiControls, "vorticity", 0.0, 0.015)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "vorticity"), guiControls.vorticity);
		})
		.name("Vorticity");

	datGui
		.add(guiControls, "dragMultiplier", 0.0, 0.015)
		.onFinishChange(function () {
			gl.useProgram(velocityProgram);
			gl.uniform1f(gl.getUniformLocation(velocityProgram, "dragMultiplier"), guiControls.dragMultiplier);
		})
		.name("Drag");

	datGui.add(guiControls, "displayMode", { Temperature: "DISP_TEMPERATURE", "Horizontal Velocity": "DISP_HORIVEL", "Vertical Velocity": "DISP_VERTVEL", Pressure: "DISP_PRESSURE" }).name("Display Mode");
	datGui.add(guiControls, "tool", { "Change Temperature": "TOOL_TEMPERATURE", "Normal Wall": "TOOL_WALL", "Heating Wall": "TOOL_WALL_HEAT", "Cooling Wall": "TOOL_WALL_COOL" }).name("Tool");
	datGui.add(guiControls, "brushSize", 1, 100).name("Brush Radius");
	datGui.add(guiControls, "intensity", 0.0005, 0.01).name("Brush Intensity");
	datGui
		.add(guiControls, "wallHeating", 0.0, 0.001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "wallHeating"), guiControls.wallHeating);
		})
		.name("Wall Heating");
	datGui
		.add(guiControls, "wallCooling", 0.0, 0.001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "wallCooling"), guiControls.wallCooling);
		})
		.name("Wall Cooling");
	datGui
		.add(guiControls, "showGraph")
		.onFinishChange(function () {
			if (guiControls.showGraph) {
				soundingGraph.canvas.style.display = "block";
			} else {
				soundingGraph.canvas.style.display = "none";
			}
		})
		.name("Show Sounding Graph");
	datGui.add(guiControls, "paused").name("Paused");
	datGui.add(guiControls, "download").name("Save simulation to file");

	datGui.width = 350;

	// END OF GUI

	var soundingGraph = {
		canvas: null,
		ctx: null,
		init: function () {
			this.canvas = document.getElementById("graphCanvas");
			this.canvas.height = window.innerHeight;
			this.canvas.width = 300;
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

			var c = this.ctx;
			c.clearRect(0, 0, canvas.width, canvas.height);
			c.fillStyle = "#00000055";
			c.fillRect(0, 0, canvas.width, canvas.height);

			c.strokeStyle = "#FF0000";

			c.beginPath();

			// c.moveTo(0, sim_res_y);

			var reachedAir = false;

			console.log(simYpos);

			for (var y = 0; y < sim_res_y; y++) {
				var temp = baseTextureValues[4 * y + 3];

				var scrYpos = map_range(y, sim_res_y, 0, 0, canvas.height);

				c.font = "15px Arial";
				c.fillStyle = "white";

				if (temp != 999.0) {
					// not wall
					if (!reachedAir) {
						// first non wall cell
						reachedAir = true;

						c.fillText("Surface: " + y, 10, scrYpos);
					} else if (y == simYpos) {
						c.fillText("" + y + " T: " + temp.toFixed(2), 10, scrYpos);
					}

					c.lineTo(temp * 100.0 + 100.0, scrYpos);
				}
			}
			c.stroke();
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
			ctrlPressed = true;
		}
	});

	document.addEventListener("keyup", (event) => {
		if (event.keyCode == 17 || event.keyCode == 224) {
			ctrlPressed = false;
		}
	});

	gl.getExtension("EXT_color_buffer_float");
	gl.getExtension("OES_texture_float_linear");

	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.disable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);

	// load shaders
	const simVertexShader = loadShader(gl.VERTEX_SHADER, "simShader.vert");
	const dispVertexShader = loadShader(gl.VERTEX_SHADER, "dispShader.vert");
	const pressureShader = loadShader(gl.FRAGMENT_SHADER, "pressureShader.frag");
	const velocityShader = loadShader(gl.FRAGMENT_SHADER, "velocityShader.frag");
	const advectionShader = loadShader(gl.FRAGMENT_SHADER, "advectionShader.frag");
	const curlShader = loadShader(gl.FRAGMENT_SHADER, "curlShader.frag");
	const vorticityShader = loadShader(gl.FRAGMENT_SHADER, "vorticityShader.frag");

	const wallSetupShader = loadShader(gl.FRAGMENT_SHADER, "wallSetupShader.frag");

	const pressureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "pressureDisplayShader.frag");
	//const temperatureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "temperatureDisplayShader.frag");
	const universalDisplayShader = loadShader(gl.FRAGMENT_SHADER, "universalDisplayShader.frag");

	// create programs
	const pressureProgram = createProgram(simVertexShader, pressureShader);
	const velocityProgram = createProgram(simVertexShader, velocityShader);
	const advectionProgram = createProgram(simVertexShader, advectionShader);
	const curlProgram = createProgram(simVertexShader, curlShader);
	const vorticityProgram = createProgram(simVertexShader, vorticityShader);

	const wallSetupProgram = createProgram(simVertexShader, wallSetupShader);

	//const temperatureDisplayProgram = createProgram(dispVertexShader, temperatureDisplayShader);
	const universalDisplayProgram = createProgram(dispVertexShader, universalDisplayShader);

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

	const baseTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	const wallTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, initialWallTex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	const wallTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	const frameBuff_0 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTexture_0, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, wallTexture_0, 0);

	const frameBuff_1 = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTexture_1, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, wallTexture_1, 0);

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

	// set constant uniforms for all shaders

	gl.useProgram(advectionProgram);
	gl.uniform2f(gl.getUniformLocation(advectionProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(advectionProgram, "wallTex"), 1);

	gl.useProgram(pressureProgram);
	gl.uniform2f(gl.getUniformLocation(pressureProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(pressureProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(pressureProgram, "wallTex"), 1);

	gl.useProgram(velocityProgram);
	gl.uniform2f(gl.getUniformLocation(velocityProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(velocityProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(velocityProgram, "wallTex"), 1);
	gl.uniform1f(gl.getUniformLocation(velocityProgram, "dragMultiplier"), 0.001);

	gl.useProgram(vorticityProgram);
	gl.uniform2f(gl.getUniformLocation(vorticityProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "curlTex"), 1);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "wallTex"), 2);

	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "vorticity"), guiControls.vorticity); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "wallHeating"), guiControls.wallHeating); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "wallCooling"), guiControls.wallCooling); // can be changed by GUI input

	// gl.useProgram(temperatureDisplayProgram);
	// gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "baseTex"), 0);
	// gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "wallTex"), 1);

	gl.useProgram(universalDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "wallTex"), 1);

	gl.useProgram(curlProgram);
	gl.uniform2f(gl.getUniformLocation(curlProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(curlProgram, "baseTex"), 0);

	gl.useProgram(wallSetupProgram);
	gl.uniform2f(gl.getUniformLocation(wallSetupProgram, "texelSize"), texelSizeX, texelSizeY);

	if (initialWallTex == null) {
		// if no save file was loaded
		// Setup walls
		gl.viewport(0, 0, sim_res_x, sim_res_y);
		gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
		gl.useProgram(wallSetupProgram);
		gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]); // gl.COLOR_ATTACHMENT0,
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	setInterval(calcFps, 1000); // log fps
	requestAnimationFrame(draw);

	function draw() {
		var leftEdge = canvas.width / 2.0 - (canvas.width * viewZoom) / 2.0;
		var rightEdge = canvas.width / 2.0 + (canvas.width * viewZoom) / 2.0;
		var mouseXinSim = map_range(mouseX, leftEdge, rightEdge, 0.0, 1.0) - viewXpos / 2.0;

		var topEdge = canvas.height / 2.0 - ((canvas.width / sim_aspect) * viewZoom) / 2.0;
		var bottemEdge = canvas.height / 2.0 + ((canvas.width / sim_aspect) * viewZoom) / 2.0;
		var mouseYinSim = map_range(mouseY, bottemEdge, topEdge, 0.0, 1.0) - (viewYpos / 2.0) * sim_aspect;

		gl.useProgram(velocityProgram);

		var inputType = 0;
		if (leftMousePressed) {
			if (guiControls.tool == "TOOL_TEMPERATURE") inputType = 1;
			else if (guiControls.tool == "TOOL_WALL") inputType = 2;
			else if (guiControls.tool == "TOOL_WALL_HEAT") inputType = 3;
			else if (guiControls.tool == "TOOL_WALL_COOL") inputType = 4;

			var intensity = guiControls.intensity;

			if (ctrlPressed) {
				intensity *= -1;
			}
			gl.uniform4f(gl.getUniformLocation(velocityProgram, "userInputValues"), mouseXinSim, mouseYinSim, intensity, guiControls.brushSize);
		}
		gl.uniform1i(gl.getUniformLocation(velocityProgram, "userInputType"), inputType); // 0 = nothing 	1 = temp	 2 = wall	3 = heating wall	4 = cooling wall

		// read from framebuffer and log
		/*
		gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
		var pixelValues = new Float32Array(4);
		gl.readPixels(mouseXinSim * sim_res_x, mouseYinSim * sim_res_y, 1, 1, gl.RGBA, gl.FLOAT, pixelValues);
		console.log("	V: " + pixelValues[0].toFixed(2) + ", " + pixelValues[1].toFixed(2) + "		P: " + pixelValues[2].toFixed(2) + "		T: " + pixelValues[3].toFixed(2));
*/
		if (!guiControls.paused) {
			gl.viewport(0, 0, sim_res_x, sim_res_y);
			// IterPerFrame
			for (var i = 0; i < IterPerFrame; i++) {
				// IterPerFrame
				// calc advection

				gl.useProgram(advectionProgram);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // advection needs linear sampling
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

				// calc pressure
				gl.useProgram(pressureProgram);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc velocity
				gl.useProgram(velocityProgram);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// calc curl
				gl.useProgram(curlProgram);
				gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.bindFramebuffer(gl.FRAMEBUFFER, curlFrameBuff);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

				// apply vorticity
				gl.useProgram(vorticityProgram);
				//	gl.activeTexture(gl.TEXTURE0);
				//	gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
				gl.activeTexture(gl.TEXTURE1);
				gl.bindTexture(gl.TEXTURE_2D, curlTexture);
				gl.activeTexture(gl.TEXTURE2);
				gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
				gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			}
		}

		if (guiControls.showGraph) {
			soundingGraph.draw(Math.floor(mouseXinSim * sim_res_x), Math.floor(mouseYinSim * sim_res_y));
		}

		// render to canvas
		gl.viewport(0, 0, canvas.width, canvas.height);

		gl.useProgram(universalDisplayProgram);
		gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
		gl.uniform3f(gl.getUniformLocation(universalDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);

		switch (guiControls.displayMode) {
			case "DISP_TEMPERATURE":
				gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 3);
				gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 1.0);
				break;
			case "DISP_HORIVEL":
				gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 0);
				gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 20.0);
				break;
			case "DISP_VERTVEL":
				gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 1);
				gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 20.0);
				break;
			case "DISP_PRESSURE":
				gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, "quantityIndex"), 2);
				gl.uniform1f(gl.getUniformLocation(universalDisplayProgram, "dispMultiplier"), 30.0);
				break;
		}

		//	gl.bindTexture(gl.TEXTURE_2D, curlTexture);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
		gl.activeTexture(gl.TEXTURE0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is canvas
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		frameNum++;
		requestAnimationFrame(draw);
	}

	//////////////////////////////////////////////////////// functions:

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
				var wallTextureValues = new Int8Array(2 * sim_res_x * sim_res_y);
				gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RG_INTEGER, gl.BYTE, wallTextureValues);
				var blobDataArray = [Uint32Array.of(saveFileVersionID), Uint16Array.of(sim_res_x), Uint16Array.of(sim_res_y), baseTextureValues, wallTextureValues];
				var blob = new Blob(blobDataArray, { type: "application/x-binary" });

				download(saveFileName + ".fluidsim", blob);
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

	function loadShader(shaderType, fileName) {
		var request = new XMLHttpRequest();
		request.open("GET", fileName, false);
		request.send(null);
		if (request.status === 200) {
			const shader = gl.createShader(shaderType);
			gl.shaderSource(shader, request.responseText);
			gl.compileShader(shader);

			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				// problem compiling shader
				throw fileName + " COMPILATION " + gl.getShaderInfoLog(shader);
			}
			return shader;
		}
	}
};

/*
Textures can only have up to 4 values per fragment/pixel, so multiple textures are required to store all fluid properties.

baseTexture (RGBA32F)				// contains the basic fluid properties
[0] = vx    Horizontal velocity
[1] = vy    Vertical   velocity
[2] = p     Pressure
[3] = t     Temperature

wallTexture (RI)
[0] = walltype


waterTexture (RG32F) // not implemented yet
[0] = w		amount of water 
[1] = cw	cloud water / amount of liquid water  



curlTexure (R32F)
[0] = curl		how much the fluid is rotating





*/
