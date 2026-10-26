"""Builds web/models/realesr-general-x4v3-cnn/model-x2.onnx from model.onnx.

Same Real-ESRGAN weights. Appends one AveragePool (2×2, stride 2) to the ×4 output so the
browser receives the ×2 image directly: identical 8-bit result to averaging in JavaScript,
with 4× less data read back from the GPU for each block.
Requires: pip install onnx
"""
import onnx
from onnx import helper

SRC = 'web/models/realesr-general-x4v3-cnn/model.onnx'
DST = 'web/models/realesr-general-x4v3-cnn/model-x2.onnx'
model = onnx.load(SRC)
graph = model.graph
name = graph.output[0].name
graph.node[-1].output[0] = 'x4_output'
graph.node.append(helper.make_node('AveragePool', ['x4_output'], [name], kernel_shape=[2, 2], strides=[2, 2], name='/lz/avg2x'))
dims = graph.output[0].type.tensor_type.shape.dim
dims[2].dim_param, dims[3].dim_param = 'height_x2', 'width_x2'
onnx.checker.check_model(model)
onnx.save(model, DST)
print('OK', DST)
