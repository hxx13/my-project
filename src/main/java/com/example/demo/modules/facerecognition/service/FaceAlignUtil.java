package com.example.demo.modules.facerecognition.service;

import ai.djl.modality.cv.Image;
import ai.djl.modality.cv.output.BoundingBox;
import ai.djl.modality.cv.output.DetectedObjects;
import ai.djl.modality.cv.output.Landmark;
import ai.djl.modality.cv.output.Point;
import ai.djl.modality.cv.output.Rectangle;

import java.util.ArrayList;
import java.util.List;

/**
 * 基于检测框 / 5 点 landmarks 的人脸裁剪（含少量扩边与对齐）。
 */
public final class FaceAlignUtil {

    private static final double MIN_FACE_EXPAND = 1.28;

    private FaceAlignUtil() {
    }

    public static DetectedObjects.DetectedObject pickLargestFace(DetectedObjects detections) {
        if (detections == null || detections.getNumberOfObjects() == 0) {
            return null;
        }
        DetectedObjects.DetectedObject best = null;
        double bestArea = 0;
        for (int i = 0; i < detections.getNumberOfObjects(); i++) {
            DetectedObjects.DetectedObject item = detections.item(i);
            Rectangle r = item.getBoundingBox().getBounds();
            double area = r.getWidth() * r.getHeight();
            if (area > bestArea) {
                bestArea = area;
                best = item;
            }
        }
        return best;
    }

    public static Image cropFace(Image img, DetectedObjects.DetectedObject face) {
        if (img == null || face == null) {
            return null;
        }
        int imgW = img.getWidth();
        int imgH = img.getHeight();
        BoundingBox box = face.getBoundingBox();

        double cx;
        double cy;
        double size;

        List<Point> landmarkPoints = extractLandmarkPoints(box);
        if (landmarkPoints.size() >= 5) {
            Point leftEye = landmarkPoints.get(0);
            Point rightEye = landmarkPoints.get(1);
            Point nose = landmarkPoints.get(2);
            cx = (leftEye.getX() + rightEye.getX() + nose.getX()) / 3.0;
            cy = (leftEye.getY() + rightEye.getY() + nose.getY()) / 3.0;
            double eyeDist = Math.hypot(rightEye.getX() - leftEye.getX(), rightEye.getY() - leftEye.getY());
            size = eyeDist * 2.8;
        } else {
            Rectangle rect = box.getBounds();
            cx = (rect.getX() + rect.getWidth() / 2.0) * imgW;
            cy = (rect.getY() + rect.getHeight() / 2.0) * imgH;
            size = Math.max(rect.getWidth() * imgW, rect.getHeight() * imgH) * MIN_FACE_EXPAND;
        }

        size = Math.max(size, 32);
        int half = (int) (size / 2.0);
        int x = clamp((int) Math.round(cx - half), 0, Math.max(0, imgW - 1));
        int y = clamp((int) Math.round(cy - half), 0, Math.max(0, imgH - 1));
        int w = clamp(half * 2, 1, imgW - x);
        int h = clamp(half * 2, 1, imgH - y);
        int side = Math.min(w, h);
        return img.getSubImage(x, y, side, side);
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    private static List<Point> extractLandmarkPoints(BoundingBox box) {
        if (!(box instanceof Landmark lm)) {
            return List.of();
        }
        List<Point> pts = new ArrayList<>();
        for (Point p : lm.getPath()) {
            pts.add(p);
        }
        return pts;
    }
}
