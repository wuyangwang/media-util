import "./App.css";

function App() {
	return (
		<main className="container">
			<h1>媒体工具箱 (Media Utility)</h1>
			
			<div className="introduction">
				<p>一款高效、简洁的跨平台媒体处理工具，旨在为您提供便捷的音视频及图片处理方案。</p>
			</div>

			<div className="features-list">
				<p>主要功能：</p>
				<ul>
					<li>🚀 批量视频格式转换与压缩</li>
					<li>🖼️ 智能图片裁剪与格式转换</li>
					<li>📂 文件夹自动化扫描</li>
					<li>⚡ 基于 FFmpeg 与 Rust 的高性能内核</li>
				</ul>
			</div>

			<div className="footer">
				<p>由 @wuyang 开发</p>
			</div>
		</main>
	);
}

export default App;
