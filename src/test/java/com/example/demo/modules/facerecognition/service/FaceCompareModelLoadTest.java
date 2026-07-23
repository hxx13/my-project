package com.example.demo.modules.facerecognition.service;

import ai.djl.inference.Predictor;
import ai.djl.modality.cv.Image;
import ai.djl.modality.cv.ImageFactory;
import ai.djl.modality.cv.util.NDImageUtils;
import ai.djl.ndarray.NDArray;
import ai.djl.ndarray.NDList;
import ai.djl.ndarray.NDManager;
import ai.djl.ndarray.types.DataType;
import ai.djl.repository.zoo.Criteria;
import ai.djl.repository.zoo.ModelZoo;
import ai.djl.repository.zoo.ZooModel;
import ai.djl.training.util.ProgressBar;
import org.junit.jupiter.api.Test;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FaceCompareModelLoadTest {

    @Test
    void loadsOfficialPytorchFaceFeatureModel() throws Exception {
        Criteria<NDList, NDList> criteria = Criteria.builder()
                .setTypes(NDList.class, NDList.class)
                .optModelUrls("https://resources.djl.ai/test-models/pytorch/face_feature.zip")
                .optModelName("face_feature")
                .optProgress(new ProgressBar())
                .optEngine("PyTorch")
                .build();

        BufferedImage bi = new BufferedImage(320, 320, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = bi.createGraphics();
        g.setColor(Color.GRAY);
        g.fillRect(0, 0, 320, 320);
        g.dispose();
        Image img = ImageFactory.getInstance().fromImage(bi);

        try (ZooModel<NDList, NDList> model = ModelZoo.loadModel(criteria);
             Predictor<NDList, NDList> predictor = model.newPredictor();
             NDManager manager = NDManager.newBaseManager()) {
            NDArray array = img.toNDArray(manager, Image.Flag.COLOR);
            array = NDImageUtils.resize(array, 160, 160);
            array = array.toType(DataType.FLOAT32, false);
            array = array.div(255f);
            array = array.transpose(2, 0, 1).expandDims(0);
            NDList output = predictor.predict(new NDList(array));
            float[] emb = output.head().toFloatArray();
            assertNotNull(emb);
            assertTrue(emb.length > 0, "embedding length should be > 0, got " + emb.length);
        }
    }
}
