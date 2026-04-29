use ab_glyph::{FontArc, PxScale};
use image::{DynamicImage, GenericImageView, Rgba};
use imageproc::drawing::{draw_hollow_rect_mut, draw_text_mut};
use imageproc::rect::Rect;
use ndarray::{Array4, ArrayViewD, Ix4};
use std::cmp::Ordering;

pub const COCO_CLASSES: [&str; 80] = [
    "人",
    "自行车",
    "汽车",
    "摩托车",
    "飞机",
    "公交车",
    "火车",
    "卡车",
    "船",
    "红绿灯",
    "消防栓",
    "停止标志",
    "停车收费表",
    "长凳",
    "鸟",
    "猫",
    "狗",
    "马",
    "羊",
    "牛",
    "大象",
    "熊",
    "斑马",
    "长颈鹿",
    "背包",
    "雨伞",
    "手提包",
    "领带",
    "手提箱",
    "飞盘",
    "滑雪板",
    "单板滑雪",
    "运动球",
    "风筝",
    "棒球棒",
    "棒球手套",
    "滑板",
    "冲浪板",
    "网球拍",
    "瓶子",
    "红酒杯",
    "杯子",
    "叉子",
    "刀",
    "勺子",
    "碗",
    "香蕉",
    "苹果",
    "三明治",
    "橙子",
    "西兰花",
    "胡萝卜",
    "热狗",
    "皮萨",
    "甜甜圈",
    "蛋糕",
    "椅子",
    "沙发",
    "盆栽",
    "床",
    "餐桌",
    "厕所",
    "电视",
    "笔记本电脑",
    "鼠标",
    "遥控器",
    "键盘",
    "手机",
    "微波炉",
    "烤箱",
    "烤面包机",
    "洗手池",
    "冰箱",
    "书",
    "时钟",
    "花瓶",
    "剪刀",
    "泰迪熊",
    "吹风机",
    "牙刷",
];

#[derive(Debug)]
pub struct Detection {
    pub x1: f32,
    pub y1: f32,
    pub x2: f32,
    pub y2: f32,
    pub score: f32,
    pub class_id: usize,
}

pub struct YoloDetector {
    width: u32,
    height: u32,
}

impl YoloDetector {
    pub fn new(width: u32, height: u32) -> Self {
        Self { width, height }
    }

    pub fn preprocess(&self, img: &DynamicImage) -> (Array4<f32>, f32, f32) {
        let (img_width, img_height) = img.dimensions();
        let scale =
            (self.width as f32 / img_width as f32).min(self.height as f32 / img_height as f32);
        let nw = (img_width as f32 * scale) as u32;
        let nh = (img_height as f32 * scale) as u32;

        let resized = img.resize_exact(nw, nh, image::imageops::FilterType::Triangle);
        let mut input = Array4::zeros(Ix4(1, 3, self.height as usize, self.width as usize));

        for (x, y, pixel) in resized.pixels() {
            let r = pixel[0] as f32 / 255.0;
            let g = pixel[1] as f32 / 255.0;
            let b = pixel[2] as f32 / 255.0;
            input[[0, 0, y as usize, x as usize]] = r;
            input[[0, 1, y as usize, x as usize]] = g;
            input[[0, 2, y as usize, x as usize]] = b;
        }

        (input, scale, scale)
    }

    pub fn postprocess(
        &self,
        output: ArrayViewD<f32>,
        scale: f32,
        original_width: u32,
        original_height: u32,
        score_threshold: f32,
        iou_threshold: f32,
    ) -> Vec<Detection> {
        let output = output.view().into_shape((84, 8400)).unwrap();
        let mut detections = Vec::new();

        for i in 0..8400 {
            let col = output.column(i);
            let scores = col.slice(ndarray::s![4..]);
            let (max_class_id, &max_score) = scores
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(Ordering::Equal))
                .unwrap();

            if max_score > score_threshold {
                let cx = col[0] / scale;
                let cy = col[1] / scale;
                let w = col[2] / scale;
                let h = col[3] / scale;

                let x1 = (cx - w / 2.0).max(0.0).min(original_width as f32);
                let y1 = (cy - h / 2.0).max(0.0).min(original_height as f32);
                let x2 = (cx + w / 2.0).max(0.0).min(original_width as f32);
                let y2 = (cy + h / 2.0).max(0.0).min(original_height as f32);

                detections.push(Detection {
                    x1,
                    y1,
                    x2,
                    y2,
                    score: max_score,
                    class_id: max_class_id,
                });
            }
        }

        self.non_max_suppression(detections, iou_threshold)
    }

    fn non_max_suppression(
        &self,
        mut detections: Vec<Detection>,
        iou_threshold: f32,
    ) -> Vec<Detection> {
        detections.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        let mut result = Vec::new();

        while !detections.is_empty() {
            let best = detections.remove(0);
            result.push(best);
            detections.retain(|item| {
                let iou = self.calculate_iou(&result.last().unwrap(), item);
                iou < iou_threshold
            });
        }

        result
    }

    fn calculate_iou(&self, det1: &Detection, det2: &Detection) -> f32 {
        let x1 = det1.x1.max(det2.x1);
        let y1 = det1.y1.max(det2.y1);
        let x2 = det1.x2.min(det2.x2);
        let y2 = det1.y2.min(det2.y2);

        let intersection = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
        let area1 = (det1.x2 - det1.x1) * (det1.y2 - det1.y1);
        let area2 = (det2.x2 - det2.x1) * (det2.y2 - det2.y1);
        let union = area1 + area2 - intersection;

        intersection / union
    }

    pub fn draw_detections(
        &self,
        img: &mut DynamicImage,
        detections: &[Detection],
        font_data: &[u8],
    ) {
        let mut rgba_img = img.to_rgba8();
        let font = FontArc::try_from_vec(font_data.to_vec()).expect("Failed to load font");
        let scale = PxScale::from(24.0);

        for det in detections {
            let rect = Rect::at(det.x1 as i32, det.y1 as i32)
                .of_size((det.x2 - det.x1) as u32, (det.y2 - det.y1) as u32);

            draw_hollow_rect_mut(&mut rgba_img, rect, Rgba([255, 0, 0, 255]));

            let label = format!("{}: {:.2}", COCO_CLASSES[det.class_id], det.score);
            draw_text_mut(
                &mut rgba_img,
                Rgba([255, 255, 255, 255]),
                det.x1 as i32,
                (det.y1 as i32 - 25).max(0),
                scale,
                &font,
                &label,
            );
        }

        *img = DynamicImage::ImageRgba8(rgba_img);
    }
}
