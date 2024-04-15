// Enable flag to make this work: chrome://flags/#enable-webgl2-compute-context

var frameNum = 0;
var lastFrameNum = 0;

function calcFps()
{
console.log(frameNum - lastFrameNum);
lastFrameNum = frameNum;
}

var canvas, gl, program; // global variables


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

var InitDemo = function() {

    canvas = document.getElementById('canvas');
    gl = canvas.getContext('webgl2'); // -compute

    if (!gl) {
        alert('Your browser does not support WebGL2');
    }

    gl.clearColor(0.75, 0.95, 1.0, 1.0); // light blue
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // load shaders
    fragmentShader = loadShader(gl.FRAGMENT_SHADER, "shader.frag");
    vertexShader = loadShader(gl.VERTEX_SHADER, "shader.vert");

    program = createProgram(vertexShader, fragmentShader);

    //
    // Create buffer
    //
    var quadVertices = [// X, Y,      U, V
	1.0, -1.0, 1, 0,
   -1.0, -1.0, 0, 0,
	1.0,  1.0, 1, 1,
   -1.0,  1.0, 0, 1 ];

// create texure

var texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, document.getElementById('texture'));


gl.activeTexture(gl.TEXTURE0);

    var VertexBufferObject = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VertexBufferObject);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadVertices), gl.STATIC_DRAW);

    var positionAttribLocation = gl.getAttribLocation(program, 'vertPosition');
	var texCoordAttribLocation = gl.getAttribLocation(program, 'vertTexCoord');

	
	//console.log(timePos);
	
    gl.vertexAttribPointer(positionAttribLocation, // Attribute location
    2, // Number of elements per attribute
    gl.FLOAT, // Type of elements
    gl.FALSE, 4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    0 // Offset from the beginning of a single vertex to this attribute
    );
    gl.vertexAttribPointer(texCoordAttribLocation, // Attribute location
    2, // Number of elements per attribute
    gl.FLOAT, // Type of elements
    gl.FALSE, 4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    2 * Float32Array.BYTES_PER_ELEMENT // Offset from the beginning of a single vertex to this attribute
    );

    
    gl.enableVertexAttribArray(positionAttribLocation);
	gl.enableVertexAttribArray(texCoordAttribLocation);
    gl.useProgram(program);


    // create texture to render to
const targetTextureWidth = 1920;
const targetTextureHeight = 1080;
const targetTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, targetTexture);
 

  // define size and format of level 0
  const level = 0;
  const internalFormat = gl.RGBA;
  const border = 0;
  const format = gl.RGBA;
  const type = gl.UNSIGNED_BYTE;
  const data = null;
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                targetTextureWidth, targetTextureHeight, border,
                format, type, data);
 
  // set the filtering so we don't need mips
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Create and bind the framebuffer
const fb = gl.createFramebuffer();

gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
 
// attach the texture as the first color attachment
const attachmentPoint = gl.COLOR_ATTACHMENT0;
gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, targetTexture, level);


gl.bindTexture(gl.TEXTURE_2D, texture);

    setInterval(calcFps,1000); // log fps

	requestAnimationFrame(draw);
    timePos = gl.getUniformLocation(program,'time');
    

    var timePos;
    var zoom = 0.0;
    
    function draw()
    {

        //gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); // standard


        zoom += 0.005;
        gl.uniform1f(timePos, zoom);
    //	console.log(zoom);

    
    // render to buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        

    gl.uniform1f(timePos, -zoom + 1.0);
    
    // render to canvas
   // gl.viewport(gl.canvas.width/2 - gl.canvas.width * zoom/2, 0, gl.canvas.width * zoom, gl.canvas.height * zoom); // zoom
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    
    
    
    
        requestAnimationFrame(draw);
        frameNum ++;
    }
};




