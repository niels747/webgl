var frameNum = 0;
var lastFrameNum = 0;
var IterPerFrame = 10;
var maxIterFound = false;
var calcCount = 0;

var viewXpos = 0.0;
var viewYpos = 0.0;
var viewZoom = 1.0;

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

var mainScript = function () {
	const canvas = document.getElementById("canvas");
	const gl = canvas.getContext("webgl2");

	const sim_res_x = parseInt(document.getElementById("simResSelX").value);
	const sim_res_y = parseInt(document.getElementById("simResSelY").value);
	const sim_aspect = sim_res_x / sim_res_y;

	var canvas_aspect;
	{
		var element = document.getElementById("IntroScreen");
		element.parentNode.removeChild(element);

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		canvas_aspect = canvas.width / canvas.height;

		window.addEventListener("resize", function resizeCanvas() {
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			canvas_aspect = canvas.width / canvas.height;
		});
	}

	var middleMousePressed = false;
	var leftMousePressed = false;
	var prevMouseX = 0;
	var prevMouseY = 0;
	var mouseX = 0;
	var mouseY = 0;
	var ctrlPressed = false;

	canvas.addEventListener("wheel", function (event) {
		var delta = 0.1;
		if (event.deltaY > 0) delta *= -1;
		if (typeof lastWheel == "undefined") lastWheel = 0; // init static variable
		const now = new Date().getTime();

		if (now - lastWheel > 20) {
			console.log(now - lastWheel);
			lastWheel = now;

			viewZoom += viewZoom * delta;

			if (viewZoom > 20.0) viewZoom = 20.0;
			else if (viewZoom < 1.0) {
				viewZoom = 1.0;
				viewXpos = 0.0;
			} else {
				//var mousePositionZoomCorrectionX = ((mouseX - canvas.width / 2 + viewXpos) * delta) / viewHeight;
				//var mousePositionZoomCorrectionY = ((mouseY - canvas.height / 2 + viewYpos) * delta) / viewHeight;
				//	viewXpos -= mousePositionZoomCorrectionX;
				//	viewYpos += mousePositionZoomCorrectionY;
			}
		}
	});

	canvas.addEventListener("mousemove", function (event) {
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

	canvas.addEventListener("mouseup", function (event) {
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

	if (!gl) {
		alert("Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera");
		throw " Error: Your browser does not support WebGL2, Download a new version of Chrome, Edge, Firefox or Opera";
	}

	// SETUP GUI
	/*
	var guiControls = new (function () {
		this.vorticity = 0.005;
		this.displayMode = 0;
	})();
*/
	var guiControls = {
		vorticity: 0.005,
		wallHeating: 0.00001, // 0.00001
		displayMode: "DISP_TEMPERATURE",
		tool: "TOOL_TEMPERATURE",
		brushSize: 0.1,
		intensity: 0.001
	};

	var datGui = new dat.GUI();
	datGui
		.add(guiControls, "vorticity", 0.0, 0.015)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "vorticity"), guiControls.vorticity);
		})
		.name("Vorticity");
	datGui.add(guiControls, "displayMode", { Temperature: "DISP_TEMPERATURE", "Horizontal velocity": "DISP_HORIVEL" }).name("Display Mode");
	datGui.add(guiControls, "tool", { Temperature: "TOOL_TEMPERATURE", Wall: "TOOL_WALL" }).name("Tool");
	datGui.add(guiControls, "brushSize", 0.01, 0.3).name("Brush Size");
	datGui.add(guiControls, "intensity", 0.0005, 0.01).name("Intensity");
	datGui
		.add(guiControls, "wallHeating", -0.0001, 0.0001)
		.onFinishChange(function () {
			gl.useProgram(vorticityProgram);
			gl.uniform1f(gl.getUniformLocation(vorticityProgram, "wallHeating"), guiControls.wallHeating);
		})
		.name("Wall Heating");

	datGui.width = 300;

	// END OF GUI

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
	const temperatureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "temperatureDisplayShader.frag");
	const horiVelDisplayShader = loadShader(gl.FRAGMENT_SHADER, "horiVelDisplayShader.frag");

	// create programs
	const pressureProgram = createProgram(simVertexShader, pressureShader);
	const velocityProgram = createProgram(simVertexShader, velocityShader);
	const advectionProgram = createProgram(simVertexShader, advectionShader);
	const curlProgram = createProgram(simVertexShader, curlShader);
	const vorticityProgram = createProgram(simVertexShader, vorticityShader);

	const wallSetupProgram = createProgram(simVertexShader, wallSetupShader);

	const pressureDisplayProgram = createProgram(dispVertexShader, pressureDisplayShader);
	const temperatureDisplayProgram = createProgram(dispVertexShader, temperatureDisplayShader);
	const horiVelDisplayProgram = createProgram(dispVertexShader, horiVelDisplayShader);

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
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	const baseTexture_1 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	const wallTexture_0 = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8I, sim_res_x, sim_res_y, 0, gl.RG_INTEGER, gl.BYTE, null);
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

	gl.useProgram(vorticityProgram);
	gl.uniform2f(gl.getUniformLocation(vorticityProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "curlTex"), 1);
	gl.uniform1i(gl.getUniformLocation(vorticityProgram, "wallTex"), 2);

	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "vorticity"), guiControls.vorticity); // can be changed by GUI input
	gl.uniform1f(gl.getUniformLocation(vorticityProgram, "wallHeating"), guiControls.wallHeating); // can be changed by GUI input

	gl.useProgram(temperatureDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, "wallTex"), 1);

	gl.useProgram(horiVelDisplayProgram);
	gl.uniform1i(gl.getUniformLocation(horiVelDisplayProgram, "baseTex"), 0);
	gl.uniform1i(gl.getUniformLocation(horiVelDisplayProgram, "wallTex"), 1);

	gl.useProgram(curlProgram);
	gl.uniform2f(gl.getUniformLocation(curlProgram, "texelSize"), texelSizeX, texelSizeY);
	gl.uniform1i(gl.getUniformLocation(curlProgram, "baseTex"), 0);

	gl.useProgram(wallSetupProgram);
	gl.uniform2f(gl.getUniformLocation(wallSetupProgram, "texelSize"), texelSizeX, texelSizeY);

	// init simulation grid to all zeros
	gl.clearColor(0.0, 0.0, 0.0, 0.0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Setup walls

	gl.viewport(0, 0, sim_res_x, sim_res_y);

	gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
	gl.useProgram(wallSetupProgram);
	gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	gl.clearColor(1.0, 0.0, 0.0, 1.0);

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
			else inputType = 2;

			var intensity = guiControls.intensity;

			if (ctrlPressed) {
				intensity *= -1;
			}
			gl.uniform4f(gl.getUniformLocation(velocityProgram, "userInputValues"), mouseXinSim, mouseYinSim, intensity, guiControls.brushSize);
		}
		gl.uniform1i(gl.getUniformLocation(velocityProgram, "userInputType"), inputType); // 0 = noting 	1 = temp	 2 = wall

		// read from framebuffer and log
		/*
		gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
		var pixelValues = new Float32Array(4);
		gl.readPixels(mouseXinSim * sim_res_x, mouseYinSim * sim_res_y, 1, 1, gl.RGBA, gl.FLOAT, pixelValues);
		console.log("	V: " + pixelValues[0].toFixed(2) + ", " + pixelValues[1].toFixed(2) + "		P: " + pixelValues[2].toFixed(2) + "		T: " + pixelValues[3].toFixed(2));
*/
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

		// render to canvas
		gl.viewport(0, 0, canvas.width, canvas.height);

		switch (guiControls.displayMode) {
			case "DISP_TEMPERATURE":
				gl.useProgram(temperatureDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(temperatureDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
				break;
			case "DISP_HORIVEL":
				gl.useProgram(horiVelDisplayProgram);
				gl.uniform2f(gl.getUniformLocation(horiVelDisplayProgram, "aspectRatios"), sim_aspect, canvas_aspect);
				gl.uniform3f(gl.getUniformLocation(horiVelDisplayProgram, "view"), viewXpos, viewYpos, viewZoom);
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
