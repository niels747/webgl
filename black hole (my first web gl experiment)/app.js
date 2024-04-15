// Enable flag to make this work: chrome://flags/#enable-webgl2-compute-context

var canvas = document.getElementById('canvas');
var gl = canvas.getContext('webgl2'); // -compute
var program;

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

    if (!gl) {
        console.log('WebGL not supported, falling back on experimental-webgl');
        gl = canvas.getContext('experimental-webgl');
    }

    if (!gl) {
        alert('Your browser does not support WebGL');
    }

    gl.clearColor(0.75, 0.95, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // load shaders
    fragmentShader = loadShader(gl.FRAGMENT_SHADER, "shader.frag");
    vertexShader = loadShader(gl.VERTEX_SHADER, "shader.vert");

    program = createProgram(vertexShader, fragmentShader);

    //
    // Create buffer
    //
    var quadVertices = [// X, Y,      U, V
	1.0, -1.0, 1, 1,
   -1.0, -1.0, 0, 1,
	1.0,  1.0, 1, 0,
   -1.0,  1.0, 0, 0
];

// create texure

var texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, document.getElementById('texture'));

gl.generateMipmap(gl.TEXTURE_2D);

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
//	setInterval(draw,17);




	requestAnimationFrame(draw);
	timePos = gl.getUniformLocation(program,'time');
};

var timePos;
var zoom = 0.0;

function draw()
{

//
    // Main render loop
	//

	zoom += 0.005;

//	console.log(zoom);

	
	
	gl.uniform1f(timePos, zoom);

	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	requestAnimationFrame(draw);
}