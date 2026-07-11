import '@/styles/home/backgroundImg.scss';

export default function BackgroundImg() {
  return (
    <div className="background-wrapper">
        <div className="wrapper-images">
            <div className="wrapper-img bg-1"></div>
            <div className="wrapper-img bg-2"></div>
            <div className="wrapper-img bg-3"></div>
            <div className="wrapper-img bg-4"></div>
        </div>
        <div className="wrapper-blur"></div>
        <div className="wrapper-color"></div>
    </div>
  );
}