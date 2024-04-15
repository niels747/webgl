var frameNum = 0;
var lastFrameNum = 0;
var IterPerFrame = 10;
var maxIterFound = false;
var calcCount = 0;

var viewXpos = 0.0;
var viewYpos = 0.0;
var viewHeight = 500.0;

var brushSize = 0.2 / 2.0;

function setBrushSize() {
	brushSize = parseFloat(document.getElementById("brushSizeSlider").value);
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

function setFullscreen() {
	if (canvas.requestFullscreen) {
		canvas.requestFullscreen();
	} else if (canvas.mozRequestFullScreen) {
		canvas.mozRequestFullScreen();
	}

	canvas.width = screen.width;
	canvas.height = screen.height;

	canvas.addEventListener("fullscreenchange", (event) => {
		if (document.fullscreenElement == null) {
			// if exiting full screen
			canvas.width = 500;
			canvas.height = 500;
		}
	});
}

var mainScript = function () {
	const canvas = document.getElementById("canvas");
	const gl = canvas.getContext("webgl2");

	canvas.width = 500;
	canvas.height = 500;

	const sim_res_x = parseInt(document.getElementById("simResSelX").value);
	const sim_res_y = parseInt(document.getElementById("simResSelY").value);
	const sim_aspect = sim_res_x / sim_res_y;

	{
		// change the document
		var element = document.getElementById("startBtn");
		element.parentNode.removeChild(element);
		element = document.getElementById("help");
		element.removeAttribute("hidden");
	}

	var middleMousePressed = false;
	var leftMousePressed = false;
	var prevMouseX = 0;
	var prevMouseY = 0;
	var mouseX = 0;
	var mouseY = 0;
	var ctrlPressed = false;

	canvas.addEventListener("mousewheel", function (addEventListener) {
		var delta = event.wheelDelta / 1000.0;
		viewHeight += viewHeight * delta;

		if (viewHeight > 2000) viewHeight = 2000;
		else if (viewHeight < 100) viewHeight = 100;
		else {
			var mousePositionZoomCorrectionX = ((mouseX - canvas.width / 2 + viewXpos) * delta) / viewHeight;
			var mousePositionZoomCorrectionY = ((mouseY - canvas.height / 2 + viewYpos) * delta) / viewHeight;

			viewXpos -= mousePositionZoomCorrectionX;
			viewYpos += mousePositionZoomCorrectionY;
		}
	});

	canvas.addEventListener("mousemove", function (event) {
		var rect = canvas.getBoundingClientRect();
		mouseX = event.clientX - rect.left;
		mouseY = event.clientY - rect.top;

		//  console.log(mouseX + ' ' + mouseY);

		if (middleMousePressed) {
			viewXpos += (mouseX - prevMouseX) / viewHeight;
			viewYpos -= (mouseY - prevMouseY) / viewHeight;

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
	}

	//alert('This is my first web gl fluid simulation, and it will be the baseline for the wheather simulation I will be building. It is best on a full hd screen in fullscreen mode (F11). There is no user interface yet. You cannot influence the simulation. Feel free to look at the commented source code (F12) ');

	gl.getExtension("EXT_color_buffer_float");
	gl.getExtension("OES_texture_float_linear");

	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.disable(gl.BLEND);
	gl.disable(gl.DEPTH_TEST);

	// load shaders
	const vertexShader = loadShader(gl.VERTEX_SHADER, "shader.vert");
	const pressureShader = loadShader(gl.FRAGMENT_SHADER, "pressureShader.frag");
	const velocityShader = loadShader(gl.FRAGMENT_SHADER, "velocityShader.frag");
	const advectionShader = loadShader(gl.FRAGMENT_SHADER, "advectionShader.frag");

	const pressureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "pressureDisplayShader.frag");
	const temperatureDisplayShader = loadShader(gl.FRAGMENT_SHADER, "temperatureDisplayShader.frag");

	// create programs
	const pressureProgram = createProgram(vertexShader, pressureShader);
	const velocityProgram = createProgram(vertexShader, velocityShader);
	const advectionProgram = createProgram(vertexShader, advectionShader);

	const pressureDisplayProgram = createProgram(vertexShader, pressureDisplayShader);
	const temperatureDisplayProgram = createProgram(vertexShader, temperatureDisplayShader);

	// square that fills the screen, so fragment shader is run for every pixel // X, Y,  U, V
	const quadVertices = [1.0, -1.0, 1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 0.0, 1.0];

	gl.activeTexture(gl.TEXTURE0);

	var VertexBufferObject = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, VertexBufferObject);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);

	var positionAttribLocation = gl.getAttribLocation(pressureDisplayProgram, "vertPosition");
	var texCoordAttribLocation = gl.getAttribLocation(pressureDisplayProgram, "vertTexCoord");

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

	const pressToVelTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, pressToVelTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	const pressToVelFrameBuff = gl.createFramebuffer();
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pressToVelFrameBuff);
	gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pressToVelTexture, 0); // attach the texture as the first color attachment

	const velToAdvecTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, velToAdvecTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	const velToAdvecFrameBuff = gl.createFramebuffer();
	gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, velToAdvecFrameBuff);
	gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, velToAdvecTexture, 0); // attach the texture as the first color attachment

	const advecToPressTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, advecToPressTexture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

	const advecToPressFrameBuff = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, advecToPressFrameBuff);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, advecToPressTexture, 0); // attach the texture as the first color attachment

	// set constant uniforms for all shaders
	gl.useProgram(pressureProgram);
	gl.uniform2f(gl.getUniformLocation(pressureProgram, "resolution"), sim_res_x, sim_res_y);

	gl.useProgram(velocityProgram);
	gl.uniform2f(gl.getUniformLocation(velocityProgram, "resolution"), sim_res_x, sim_res_y);

	gl.useProgram(advectionProgram);
	gl.uniform2f(gl.getUniformLocation(advectionProgram, "resolution"), sim_res_x, sim_res_y);

	gl.useProgram(temperatureDisplayProgram);

	// init simulation grids to all zeros
	gl.clearColor(0.0, 0.0, 0.0, 0.0);
	gl.bindFramebuffer(gl.FRAMEBUFFER, velToAdvecFrameBuff);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.clearColor(1.0, 0.0, 0.0, 1.0);

	setInterval(calcFps, 1000); // log fps
	requestAnimationFrame(draw);

	function draw() {
		var viewWidth = viewHeight * sim_aspect;

		var viewPortX = canvas.width / 2 + viewXpos * viewHeight - viewWidth / 2;
		var viewPortY = canvas.height / 2 + viewYpos * viewHeight - viewHeight / 2;

		var mouseXinSim = map_range(mouseX, viewPortX, viewPortX + viewWidth, 0.0, 1.0);
		var mouseYinSim = map_range(canvas.height - mouseY, viewPortY, viewPortY + viewHeight, 0.0, 1.0);

		gl.useProgram(velocityProgram);

		var heating = 0.0;

		if (leftMousePressed) {
			heating = 0.001;

			if (ctrlPressed) {
				heating *= -1;
			}
		}
		gl.uniform4f(gl.getUniformLocation(velocityProgram, "userInput"), mouseXinSim, mouseYinSim, heating, brushSize);

		for (var i = 0; i < IterPerFrame; i++) {
			gl.viewport(0, 0, sim_res_x, sim_res_y);

			// calc advection
			gl.useProgram(advectionProgram);
			gl.bindTexture(gl.TEXTURE_2D, velToAdvecTexture);
			gl.bindFramebuffer(gl.FRAMEBUFFER, advecToPressFrameBuff);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			// calc pressure
			gl.useProgram(pressureProgram);
			gl.bindTexture(gl.TEXTURE_2D, advecToPressTexture);
			gl.bindFramebuffer(gl.FRAMEBUFFER, pressToVelFrameBuff);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			// calc velocity
			gl.useProgram(velocityProgram);
			gl.bindTexture(gl.TEXTURE_2D, pressToVelTexture);
			gl.bindFramebuffer(gl.FRAMEBUFFER, velToAdvecFrameBuff);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}

		// render to canvas

		gl.viewport(viewPortX, viewPortY, viewWidth, viewHeight);

		gl.useProgram(temperatureDisplayProgram);
		//  gl.useProgram(pressureDisplayProgram);

		gl.bindTexture(gl.TEXTURE_2D, advecToPressTexture);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is canvas
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		requestAnimationFrame(draw);
		frameNum++;
	}

	//////////////////////////////////////////////////////// functions:

	function createProgram(vertexShader, fragmentShader) {
		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		var success = gl.getProgramParameter(program, gl.LINK_STATUS);
		if (success) {
			return program;
		}
		console.log(gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
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
Textures can only have up to 4 values per fragment/pixel

Texture1
0	vx
1	vy
2	p
3 	t	


Texture2
0	w
1	
2	
3 	






*/
